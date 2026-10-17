import type { SupabaseClient } from "@supabase/supabase-js";
import type { Interaction } from "../interactions/types";
import type { InstantReplyMode } from "../channel-accounts/types";
import { WHATSAPP_SESSION_WINDOW_HOURS } from "../whatsapp/window";

/**
 * CRM-INSTANT-ACK-01 — "Instant acknowledgment, then human".
 *
 * When a connected account is set to it, the first message a contact sends within a
 * 24-hour period gets ONE fixed acknowledgement — the business's own text, never
 * generated — and the conversation stays with a person: the inbound message keeps its
 * "needs response" flag, because an automatic acknowledgement is not an answer.
 *
 * Deterministic and called from the webhook ingest (service-role clients, no session).
 * Every outcome is a value, never an exception, so an acknowledgement problem can never
 * lose the inbound message that was already recorded.
 *
 * Rules, in order:
 * - the mode must be on; the channel must have a send path (WhatsApp, Instagram DM,
 *   Facebook Messenger);
 * - the contact must not have opted out (see `isOptOutText`);
 * - the inbound message must still be inside the 24-hour customer-service window both
 *   WhatsApp and Messenger enforce — a webhook redelivered a day late gets nothing;
 * - no acknowledgement went to this contact on this channel in the last 24 hours;
 * - exactly one per inbound message: the row is claimed under the dedupe key
 *   `instant_ack:<inbound id>` *before* the send, so a redelivered webhook, or two
 *   deliveries racing, find the claim and send nothing.
 */

export const DEFAULT_ACK_TEXT = "Thanks for your message — we'll reply shortly.";
export const AUTO_ACK_INTERACTION_TYPE = "automatic_acknowledgement";
export const ACK_SUPPORTED_CHANNELS = ["whatsapp", "instagram", "facebook_messenger"] as const;
export type AckChannel = (typeof ACK_SUPPORTED_CHANNELS)[number];
/** The `crm.channel_accounts` providers whose inbound messages reach the acknowledgement
 * (WhatsApp is connected on the WhatsApp page, through `crm.channel_connection`). */
export const ACK_SUPPORTED_PROVIDERS = ["instagram", "facebook_messenger"] as const;

/** The instant-reply modes the app offers. `draft_approve` stays in the database enum
 * only; nothing drafts on ingest (CRM-INSTANT-ACK-01's migration). */
export const OFFERED_INSTANT_REPLY_MODES = ["off", "instant_ack_then_human"] as const satisfies readonly InstantReplyMode[];

export const INSTANT_REPLY_MODE_LABELS: Record<(typeof OFFERED_INSTANT_REPLY_MODES)[number], string> = {
  off: "Off",
  instant_ack_then_human: "Instant acknowledgment, then human",
};

export function isOfferedInstantReplyMode(value: string): value is (typeof OFFERED_INSTANT_REPLY_MODES)[number] {
  return (OFFERED_INSTANT_REPLY_MODES as readonly string[]).includes(value);
}

const OPT_OUT = ["stop", "stop all", "unsubscribe", "opt out", "opt-out", "optout", "cancel", "end", "quit"];
const OPT_IN = ["start", "unstop", "subscribe", "opt in", "opt-in"];

/** A whole message that is an opt-out keyword ("STOP", "unsubscribe"...). A sentence that
 * merely contains "stop" is not one. */
export function isOptOutText(text: string | null | undefined): boolean {
  return OPT_OUT.includes((text ?? "").trim().toLowerCase().replace(/[.!]+$/, ""));
}

function isOptInText(text: string | null | undefined): boolean {
  return OPT_IN.includes((text ?? "").trim().toLowerCase().replace(/[.!]+$/, ""));
}

export type AckOutcome =
  | { status: "off" }
  | { status: "unsupported_channel" }
  | { status: "opted_out" }
  | { status: "window_closed" }
  | { status: "already_acknowledged_recently" }
  | { status: "duplicate" }
  | { status: "sent"; interactionId: string }
  | { status: "failed"; interactionId: string; error: string };

export type AckSend = (text: string) => Promise<{ ok: true; providerMessageId?: string | null } | { ok: false; error: string }>;

const DAY_MS = WHATSAPP_SESSION_WINDOW_HOURS * 60 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

export async function maybeSendInstantAcknowledgement(input: {
  businessId: string;
  channel: string;
  mode: InstantReplyMode;
  inbound: Pick<Interaction, "id" | "conversation_id" | "party_id" | "external_actor_id" | "occurred_at" | "content_excerpt">;
  send: AckSend;
  clients: { crm: SupabaseClient; core: SupabaseClient };
  now?: Date;
}): Promise<AckOutcome> {
  const { businessId, inbound, clients } = input;
  const now = input.now ?? new Date();

  if (input.mode !== "instant_ack_then_human") return { status: "off" };
  if (!(ACK_SUPPORTED_CHANNELS as readonly string[]).includes(input.channel)) return { status: "unsupported_channel" };
  const actor = inbound.external_actor_id;
  if (!actor) return { status: "unsupported_channel" };

  if (isOptOutText(inbound.content_excerpt) || (await hasOptedOut(clients.crm, businessId, input.channel, actor))) {
    return { status: "opted_out" };
  }

  if (now.getTime() - new Date(inbound.occurred_at).getTime() >= DAY_MS) return { status: "window_closed" };

  const dedupeKey = `instant_ack:${inbound.id}`;
  const { data: claimed, error: claimedError } = await clients.crm
    .from("interaction")
    .select("id")
    .eq("business_id", businessId)
    .eq("client_dedupe_key", dedupeKey)
    .maybeSingle();
  if (claimedError) throw claimedError;
  if (claimed) return { status: "duplicate" };

  const { data: recent, error: recentError } = await clients.crm
    .from("interaction")
    .select("id")
    .eq("business_id", businessId)
    .eq("channel", input.channel)
    .eq("external_actor_id", actor)
    .eq("interaction_type", AUTO_ACK_INTERACTION_TYPE)
    .neq("status", "failed")
    .gte("occurred_at", new Date(now.getTime() - DAY_MS).toISOString())
    .limit(1)
    .maybeSingle();
  if (recentError) throw recentError;
  if (recent) return { status: "already_acknowledged_recently" };

  const text = await getAckText(clients.crm, businessId);

  // Claim before sending. `processing` until the provider answers, so a crash between
  // here and the send leaves a visible, unsent row rather than a phantom "sent" one.
  const { data: row, error: insertError } = await clients.crm
    .from("interaction")
    .insert({
      business_id: businessId,
      conversation_id: inbound.conversation_id,
      party_id: inbound.party_id,
      channel: input.channel,
      external_actor_id: actor,
      client_dedupe_key: dedupeKey,
      direction: "outbound",
      interaction_type: AUTO_ACK_INTERACTION_TYPE,
      occurred_at: now.toISOString(),
      content_excerpt: text,
      status: "processing",
      requires_response: false,
      source_module: "crm_instant_ack",
      metadata: { automatic: true, inReplyToInteractionId: inbound.id },
    })
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) return { status: "duplicate" };
    throw insertError;
  }
  const interactionId = (row as { id: string }).id;

  const result = await input.send(text).catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }));

  const update = result.ok
    ? { status: "received", ...(result.providerMessageId ? { external_message_id: result.providerMessageId } : {}) }
    : { status: "failed", metadata: { automatic: true, inReplyToInteractionId: inbound.id, failureReason: result.error } };
  const { error: updateError } = await clients.crm.from("interaction").update(update).eq("id", interactionId).eq("business_id", businessId);
  if (updateError) throw updateError;

  const { error: auditError } = await clients.core.rpc("append_audit_log", {
    p_business_id: businessId,
    p_actor_id: null,
    p_action: result.ok ? "crm_interaction.auto_acknowledged" : "crm_interaction.auto_acknowledgement_failed",
    p_entity_type: "crm_interaction",
    p_entity_id: interactionId,
    p_before: null,
    p_after: { conversationId: inbound.conversation_id, channel: input.channel, inReplyToInteractionId: inbound.id },
  });
  if (auditError) throw auditError;

  return result.ok ? { status: "sent", interactionId } : { status: "failed", interactionId, error: result.error };
}

/** The latest opt-out or opt-in keyword this contact sent on this channel decides. */
async function hasOptedOut(crm: SupabaseClient, businessId: string, channel: string, actor: string): Promise<boolean> {
  const keywords = [...OPT_OUT, ...OPT_IN];
  const { data, error } = await crm
    .from("interaction")
    .select("content_excerpt")
    .eq("business_id", businessId)
    .eq("channel", channel)
    .eq("external_actor_id", actor)
    .eq("direction", "inbound")
    .in("content_excerpt", [...keywords, ...keywords.map((k) => k.toUpperCase()), ...keywords.map((k) => k[0]!.toUpperCase() + k.slice(1))])
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const latest = (data as { content_excerpt: string | null } | null)?.content_excerpt;
  return latest ? isOptOutText(latest) && !isOptInText(latest) : false;
}

export async function getAckText(crm: SupabaseClient, businessId: string): Promise<string> {
  const { data, error } = await crm.from("instant_reply_settings").select("ack_text").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  const text = (data as { ack_text: string } | null)?.ack_text?.trim();
  return text || DEFAULT_ACK_TEXT;
}
