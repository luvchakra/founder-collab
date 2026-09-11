import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { attachOutboundMessageId, markInteractionFailed, recordInteraction } from "../interactions/mutations";
import { getDecryptedAccessToken } from "../channel-connections/queries";
import { whatsAppCloudApiAdapter } from "./cloud-api-adapter";
import { computeWhatsAppWindowStatus, type WhatsAppWindowStatus } from "./window";

export type SendWhatsAppReplyResult = { ok: true; interactionId: string } | { ok: false; error: string; requiresTemplate?: boolean };

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
  const supabase = await createClient();

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

  const windowStatus = computeWhatsAppWindowStatus(lastInbound.occurred_at, new Date());
  if (!windowStatus.withinWindow) {
    return {
      ok: false,
      error: "This conversation's 24-hour WhatsApp customer service window has closed -- send a template message instead.",
      requiresTemplate: true,
    };
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

  const interaction = await recordInteraction(businessId, {
    conversationId,
    channel: "whatsapp",
    externalActorId: lastInbound.external_actor_id,
    direction: "outbound",
    contentExcerpt: text,
    clientDedupeKey: crypto.randomUUID(),
  });

  const sendResult = await whatsAppCloudApiAdapter.sendText({ phoneNumberId: connection.external_account_id, accessToken }, lastInbound.external_actor_id, text);
  if (!sendResult.ok) {
    await markInteractionFailed(businessId, interaction.id, sendResult.error);
    return { ok: false, error: sendResult.error };
  }
  if (sendResult.providerMessageId) {
    await attachOutboundMessageId(businessId, interaction.id, sendResult.providerMessageId);
  }
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
