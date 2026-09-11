import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { attachOutboundMessageId, markInteractionFailed, recordInteraction } from "../interactions/mutations";
import { applyChannelConnectionHealthResult } from "../channel-connections/mutations";
import { getDecryptedAccessToken } from "../channel-connections/queries";
import { getWhatsAppTemplate } from "./templates";
import { whatsAppCloudApiAdapter } from "./cloud-api-adapter";
import { computeWhatsAppWindowStatus, type WhatsAppWindowStatus } from "./window";

export type SendWhatsAppReplyResult = { ok: true; interactionId: string } | { ok: false; error: string; requiresTemplate?: boolean };

type OutboundContext =
  | { ok: true; recipientPhone: string; lastInboundOccurredAt: string; connectionId: string; phoneNumberId: string; accessToken: string }
  | { ok: false; error: string };

/** Shared by `sendWhatsAppReply()` (CRM-07.6) and `sendWhatsAppTemplate()` (CRM-07.8):
 * both need the same recipient phone (the conversation's last inbound sender) and the
 * same connected channel's credentials -- only what each does with the window status
 * differs (a template send is exactly the thing that's still allowed once the window
 * closes, so it never gates on it). */
async function resolveOutboundContext(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, conversationId: string): Promise<OutboundContext> {
  const { data: conversation, error: conversationError } = await supabase
    .from("conversation")
    .select("id, primary_channel")
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .single();
  if (conversationError) throw conversationError;
  if (conversation.primary_channel !== "whatsapp") {
    return { ok: false, error: "This conversation's primary channel isn't WhatsApp." };
  }

  const { data: lastInbound, error: lastInboundError } = await supabase
    .from("interaction")
    .select("external_actor_id, occurred_at")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .not("external_actor_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastInboundError) throw lastInboundError;
  if (!lastInbound?.external_actor_id) {
    return { ok: false, error: "This conversation has no inbound WhatsApp message yet to reply to." };
  }

  const { data: connection, error: connectionError } = await supabase
    .from("channel_connection")
    .select("id, external_account_id")
    .eq("business_id", businessId)
    .eq("channel", "whatsapp")
    .eq("status", "connected")
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) return { ok: false, error: "WhatsApp isn't connected for this business." };

  const accessToken = await getDecryptedAccessToken(businessId, connection.id);
  if (!accessToken) return { ok: false, error: "WhatsApp isn't connected for this business." };

  return {
    ok: true,
    recipientPhone: lastInbound.external_actor_id,
    lastInboundOccurredAt: lastInbound.occurred_at,
    connectionId: connection.id,
    phoneNumberId: connection.external_account_id,
    accessToken,
  };
}

/**
 * CRM-07.6's "Send Free-form WhatsApp Reply": composes and sends a plain-text reply
 * through the already-connected WhatsApp channel for one conversation, recorded on the
 * same `crm.interaction` timeline an inbound message would land on. CRM-07.7's 24-hour
 * window is checked first (`getConversationWhatsAppWindowStatus()` below) -- Meta's Cloud
 * API itself rejects a free-form send outside that window, but checking here gives the UI
 * a clear, specific error instead of surfacing a raw Graph API failure.
 *
 * Follows `recordInteraction()`'s own documented outbound idempotency shape: the
 * interaction row is inserted (under a fresh `clientDedupeKey`) *before* the network
 * send, then either `attachOutboundMessageId()` (success) or `markInteractionFailed()`
 * (failure) updates it afterward -- so a failed send is never silently unrecorded, and a
 * caller could retry it by resending with the same key (no retry UI yet, but the
 * mechanism this relies on already supports it, CRM-01.6).
 */
export async function sendWhatsAppReply(businessId: string, conversationId: string, text: string): Promise<SendWhatsAppReplyResult> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm_messages.send");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const context = await resolveOutboundContext(supabase, businessId, conversationId);
  if (!context.ok) return context;

  const windowStatus = computeWhatsAppWindowStatus(context.lastInboundOccurredAt, new Date());
  if (!windowStatus.withinWindow) {
    return {
      ok: false,
      error: "This conversation's 24-hour WhatsApp customer service window has closed -- send a template message instead.",
      requiresTemplate: true,
    };
  }

  const interaction = await recordInteraction(businessId, {
    conversationId,
    channel: "whatsapp",
    externalActorId: context.recipientPhone,
    direction: "outbound",
    contentExcerpt: text,
    clientDedupeKey: crypto.randomUUID(),
  });

  const sendResult = await whatsAppCloudApiAdapter.sendText({ phoneNumberId: context.phoneNumberId, accessToken: context.accessToken }, context.recipientPhone, text);
  if (!sendResult.ok) {
    await markInteractionFailed(businessId, interaction.id, sendResult.error);
    await applyChannelConnectionHealthResult(businessId, context.connectionId, { ok: false, statusCode: sendResult.statusCode });
    return { ok: false, error: sendResult.error };
  }
  if (sendResult.providerMessageId) {
    await attachOutboundMessageId(businessId, interaction.id, sendResult.providerMessageId);
  }
  await applyChannelConnectionHealthResult(businessId, context.connectionId, { ok: true });

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_interaction.sent",
    entityType: "crm_interaction",
    entityId: interaction.id,
    after: { conversationId, channel: "whatsapp", kind: "free_form" },
  });

  return { ok: true, interactionId: interaction.id };
}

/**
 * Row 77's "CRM-07.6 media expansion" -- the free-form composer's sibling send path for
 * an image, reusing `whatsAppCloudApiAdapter.sendMedia()` (already built alongside
 * `sendText()`/`sendTemplate()`, CRM-07.1, but never called from anywhere until now).
 * Same window-gated, record-before-send, idempotent shape as `sendWhatsAppReply()`
 * above -- an image send is a free-form message like any other, so CRM-07.7's 24-hour
 * window applies identically. `mediaUrl` must already be a public URL (Meta's Cloud API
 * `image.link` field fetches it directly); this story doesn't add a file-upload/hosting
 * step of its own, since a founder pasting a link to media already hosted somewhere
 * (product photos, a shared drive) is the simplest real version of "send media" without
 * building new storage infrastructure this story doesn't otherwise need.
 */
export async function sendWhatsAppMedia(businessId: string, conversationId: string, mediaUrl: string, caption: string | null): Promise<SendWhatsAppReplyResult> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm_messages.send");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const context = await resolveOutboundContext(supabase, businessId, conversationId);
  if (!context.ok) return context;

  const windowStatus = computeWhatsAppWindowStatus(context.lastInboundOccurredAt, new Date());
  if (!windowStatus.withinWindow) {
    return {
      ok: false,
      error: "This conversation's 24-hour WhatsApp customer service window has closed -- send a template message instead.",
      requiresTemplate: true,
    };
  }

  const interaction = await recordInteraction(businessId, {
    conversationId,
    channel: "whatsapp",
    externalActorId: context.recipientPhone,
    direction: "outbound",
    contentExcerpt: caption ?? "[Image]",
    mediaReference: mediaUrl,
    clientDedupeKey: crypto.randomUUID(),
  });

  const sendResult = await whatsAppCloudApiAdapter.sendMedia({ phoneNumberId: context.phoneNumberId, accessToken: context.accessToken }, context.recipientPhone, mediaUrl, caption ?? undefined);
  if (!sendResult.ok) {
    await markInteractionFailed(businessId, interaction.id, sendResult.error);
    await applyChannelConnectionHealthResult(businessId, context.connectionId, { ok: false, statusCode: sendResult.statusCode });
    return { ok: false, error: sendResult.error };
  }
  if (sendResult.providerMessageId) {
    await attachOutboundMessageId(businessId, interaction.id, sendResult.providerMessageId);
  }
  await applyChannelConnectionHealthResult(businessId, context.connectionId, { ok: true });

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_interaction.sent",
    entityType: "crm_interaction",
    entityId: interaction.id,
    after: { conversationId, channel: "whatsapp", kind: "media" },
  });

  return { ok: true, interactionId: interaction.id };
}

/**
 * CRM-07.8's other half: sending a catalog template is the one outbound path that still
 * works once CRM-07.7's 24-hour window has closed (that's the whole reason Meta requires
 * pre-approved templates for it) -- so this deliberately never calls
 * `computeWhatsAppWindowStatus()`. `variables` must match the template's own
 * `variable_count` exactly; Meta's own API would otherwise reject the send with a less
 * specific error, so this checks it first.
 */
export async function sendWhatsAppTemplate(businessId: string, conversationId: string, templateId: string, variables: string[]): Promise<SendWhatsAppReplyResult> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm_messages.send");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const template = await getWhatsAppTemplate(businessId, templateId);
  if (!template || !template.is_active) return { ok: false, error: "This template is not available." };
  if (variables.length !== template.variable_count) {
    return { ok: false, error: `This template expects ${template.variable_count} variable(s), got ${variables.length}.` };
  }

  const context = await resolveOutboundContext(supabase, businessId, conversationId);
  if (!context.ok) return context;

  const templateVariables = Object.fromEntries(variables.map((value, index) => [`var${index + 1}`, value]));
  const interaction = await recordInteraction(businessId, {
    conversationId,
    channel: "whatsapp",
    externalActorId: context.recipientPhone,
    direction: "outbound",
    contentExcerpt: `[Template: ${template.name}]`,
    clientDedupeKey: crypto.randomUUID(),
    metadata: { templateId: template.id, templateName: template.name, templateVariables },
  });

  const sendResult = await whatsAppCloudApiAdapter.sendTemplate(
    { phoneNumberId: context.phoneNumberId, accessToken: context.accessToken },
    context.recipientPhone,
    template.name,
    template.language_code,
    templateVariables,
  );
  if (!sendResult.ok) {
    await markInteractionFailed(businessId, interaction.id, sendResult.error);
    await applyChannelConnectionHealthResult(businessId, context.connectionId, { ok: false, statusCode: sendResult.statusCode });
    return { ok: false, error: sendResult.error };
  }
  if (sendResult.providerMessageId) {
    await attachOutboundMessageId(businessId, interaction.id, sendResult.providerMessageId);
  }
  await applyChannelConnectionHealthResult(businessId, context.connectionId, { ok: true });

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_interaction.sent",
    entityType: "crm_interaction",
    entityId: interaction.id,
    after: { conversationId, channel: "whatsapp", kind: "template", templateId: template.id, templateName: template.name },
  });

  return { ok: true, interactionId: interaction.id };
}

/** Read-only counterpart used by the conversation detail page to decide whether to show
 * the free-form reply composer or CRM-07.7's "window closed" notice -- same underlying
 * query `sendWhatsAppReply()` runs, duplicated rather than shared because one is a page
 * render (cheap, re-run on every request) and the other guards a real network send. */
export async function getConversationWhatsAppWindowStatus(businessId: string, conversationId: string): Promise<WhatsAppWindowStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interaction")
    .select("occurred_at")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .not("external_actor_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return computeWhatsAppWindowStatus(data.occurred_at, new Date());
}
