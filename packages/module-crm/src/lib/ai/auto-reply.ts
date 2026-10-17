import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@cofounderai/core/db/admin";
import { AiProviderError } from "@cofounderai/core/ai/business-router";
import { sendWhatsAppTextAsSystem } from "../whatsapp/messaging";
import { buildReplyFacts } from "./reply-draft-core";
import { runReplyDraft, type StoredReplyDraft } from "./reply-draft";
import { AUTO_SEND_TOPICS, preClaimSkipReason, whatsAppContactHash, type AiReplyMode, type AutoReplyContext, type AutoReplySkipReason } from "./auto-reply-core";

/**
 * PLATFORM-P1-12.5/12.6 -- automatic WhatsApp AI replies (docs/design/
 * crm-whatsapp-ai-replies.md, phase 2; owner-approved 2026-10-17, CLAUDE.md AI rule 3).
 *
 * For a business whose WhatsApp account is set to "Send automatically", an inbound message
 * goes through the same draft pipeline a person uses (`runReplyDraft()`: facts only,
 * confidence >= 0.7, no needs_person topics) and only an "answered" draft on an allowed
 * topic is sent. In order, and stopping at the first "no":
 *
 * 1. plain-code checks: mode, CRM licence, AI switches (a failed lookup is "no"), WhatsApp
 *    connected, inside the 24-hour window, not opted out, still the newest unanswered
 *    message;
 * 2. the claim (`crm.claim_ai_auto_reply()`): one row per inbound message, ever -- a
 *    redelivered webhook or a re-drained event gets the existing row back and stops -- with
 *    the daily (100 per business) and per-conversation (3) limits counted under a lock;
 * 3. the AI answer, then the proposal saved on the claim;
 * 4. the send, and its real outcome (sent / failed) recorded. The table's triggers write
 *    every claim and outcome to `core.audit_log`.
 *
 * Anything not sent stays for a person: the draft (when one was made) is in the Conversations
 * page's draft panel, exactly as in "Draft for review".
 *
 * Runs with no signed-in session (the webhook, or the drain), so every read and write uses
 * the service role pinned to the business the message belongs to. Facts are the business
 * profile and recorded products and prices only; order/job status and offering knowledge are
 * read through other modules' session-scoped contracts, so those questions stay with a person.
 */

export type AutoReplyOutcome =
  | { status: "not_applicable" }
  | { status: "not_auto" }
  | { status: "duplicate"; id: string; existingStatus: string }
  | { status: "skipped"; id: string; reason: AutoReplySkipReason }
  | { status: "sent"; id: string; outboundInteractionId: string }
  | { status: "failed"; id: string; error: string };

export type LoadedAutoReplyContext = {
  mode: AiReplyMode | null;
  conversationId: string;
  partyId: string | null;
  recipientPhone: string;
  ctx: AutoReplyContext;
};

type Claim = { id: string; status: "requested" | "sent" | "failed" | "skipped"; reason: AutoReplySkipReason | null; created: boolean };

type FinishPatch = {
  status?: "sent" | "failed" | "skipped";
  reason?: AutoReplySkipReason | "send_failed";
  answer?: string | null;
  topic?: string | null;
  facts_used?: { id: string; label: string }[];
  outbound_interaction_id?: string | null;
  error?: string | null;
};

export type AutoReplyDeps = {
  loadContext(businessId: string, interactionId: string): Promise<LoadedAutoReplyContext | null>;
  claim(businessId: string, interactionId: string, skipReason: AutoReplySkipReason | null): Promise<Claim>;
  finish(businessId: string, id: string, patch: FinishPatch): Promise<void>;
  draft(input: { businessId: string; interactionId: string; message: string }): Promise<StoredReplyDraft>;
  send(input: {
    businessId: string;
    conversationId: string;
    recipientPhone: string;
    text: string;
    autoReplyId: string;
    topic: string;
    factsUsed: { id: string; label: string }[];
  }): Promise<{ ok: true; interactionId: string } | { ok: false; error: string; interactionId?: string }>;
};

export async function processWhatsAppAutoReply(
  businessId: string,
  interactionId: string,
  deps: AutoReplyDeps = defaultAutoReplyDeps(),
  now: Date = new Date(),
): Promise<AutoReplyOutcome> {
  const loaded = await deps.loadContext(businessId, interactionId);
  if (!loaded) return { status: "not_applicable" };
  if (loaded.mode !== "auto") return { status: "not_auto" };

  const claim = await deps.claim(businessId, interactionId, preClaimSkipReason(loaded.ctx, now));
  if (!claim.created) return { status: "duplicate", id: claim.id, existingStatus: claim.status };
  if (claim.status !== "requested") return { status: "skipped", id: claim.id, reason: claim.reason ?? "policy_check_failed" };

  const skip = async (reason: AutoReplySkipReason, extra: FinishPatch = {}): Promise<AutoReplyOutcome> => {
    await deps.finish(businessId, claim.id, { ...extra, status: "skipped", reason });
    return { status: "skipped", id: claim.id, reason };
  };

  let draft: StoredReplyDraft;
  try {
    draft = await deps.draft({ businessId, interactionId, message: loaded.ctx.message });
  } catch (err) {
    return skip(err instanceof AiProviderError && err.code === "feature_disabled" ? "ai_off" : "ai_error");
  }
  if (draft.status !== "answered") {
    return skip(draft.reason ?? (draft.topic === "needs_person" ? "needs_person" : "cannot_answer"), { topic: draft.topic });
  }
  const proposal = { answer: draft.answer, topic: draft.topic, facts_used: draft.factsUsed };
  if (!AUTO_SEND_TOPICS.includes(draft.topic)) return skip("topic_not_allowed", proposal);

  // The proposal is saved on the claim before anything is sent.
  await deps.finish(businessId, claim.id, proposal);

  let result: Awaited<ReturnType<AutoReplyDeps["send"]>>;
  try {
    result = await deps.send({
      businessId,
      conversationId: loaded.conversationId,
      recipientPhone: loaded.recipientPhone,
      text: draft.answer,
      autoReplyId: claim.id,
      topic: draft.topic,
      factsUsed: draft.factsUsed,
    });
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : "The send failed." };
  }

  if (result.ok) {
    await deps.finish(businessId, claim.id, { status: "sent", outbound_interaction_id: result.interactionId });
    return { status: "sent", id: claim.id, outboundInteractionId: result.interactionId };
  }
  const error = result.error.slice(0, 500);
  await deps.finish(businessId, claim.id, { status: "failed", reason: "send_failed", error, outbound_interaction_id: result.interactionId ?? null });
  return { status: "failed", id: claim.id, error };
}

/** Both AI switches this path depends on, plus the platform-wide AI policy. Any read error is
 * "unknown", which the caller treats as "do not send". */
async function readAiAllowed(platform: SupabaseClient): Promise<boolean | "unknown"> {
  try {
    const [switches, policy] = await Promise.all([
      platform.from("ai_operation_switches").select("operation, enabled").in("operation", ["draft_customer_reply", "auto_send_customer_reply"]),
      platform.from("ai_feature_policies").select("ai_enabled").eq("id", true).maybeSingle(),
    ]);
    if (switches.error || policy.error) return "unknown";
    if ((switches.data ?? []).some((s: { enabled: boolean }) => s.enabled === false)) return false;
    return (policy.data as { ai_enabled?: boolean } | null)?.ai_enabled !== false;
  } catch {
    return "unknown";
  }
}

export function defaultAutoReplyDeps(): AutoReplyDeps {
  const crm = createAdminClient({ schema: "crm" });
  const core = createAdminClient({ schema: "core" });
  const platform = createAdminClient({ schema: "platform" });

  return {
    async loadContext(businessId, interactionId) {
      const { data: interaction, error } = await crm
        .from("interaction")
        .select("id, conversation_id, party_id, channel, direction, external_actor_id, content_excerpt, occurred_at, responded_at")
        .eq("business_id", businessId)
        .eq("id", interactionId)
        .maybeSingle();
      if (error) throw error;
      if (!interaction || interaction.channel !== "whatsapp" || interaction.direction !== "inbound" || !interaction.external_actor_id) return null;

      const { data: connection, error: connectionError } = await crm
        .from("channel_connection")
        .select("status, ai_reply_mode, access_token_encrypted")
        .eq("business_id", businessId)
        .eq("channel", "whatsapp")
        .neq("status", "disconnected")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection || connection.ai_reply_mode !== "auto") {
        return { mode: (connection?.ai_reply_mode as AiReplyMode | undefined) ?? null, conversationId: interaction.conversation_id, partyId: interaction.party_id, recipientPhone: interaction.external_actor_id, ctx: {} as AutoReplyContext };
      }

      const [licensed, latest, optOut, aiAllowed] = await Promise.all([
        core.rpc("has_module", { p_business_id: businessId, p_key: "crm" }),
        crm
          .from("interaction")
          .select("id")
          .eq("business_id", businessId)
          .eq("conversation_id", interaction.conversation_id)
          .eq("direction", "inbound")
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        core
          .from("communication_suppressions")
          .select("id")
          .eq("business_id", businessId)
          .eq("channel", "whatsapp")
          .eq("email_hash", whatsAppContactHash(interaction.external_actor_id))
          .limit(1),
        readAiAllowed(platform),
      ]);
      if (licensed.error) throw licensed.error;
      if (latest.error) throw latest.error;
      if (optOut.error) throw optOut.error;

      return {
        mode: "auto",
        conversationId: interaction.conversation_id,
        partyId: interaction.party_id,
        recipientPhone: interaction.external_actor_id,
        ctx: {
          licensed: licensed.data === true,
          aiAllowed,
          connected: connection.status === "connected" && Boolean(connection.access_token_encrypted),
          optedOut: (optOut.data ?? []).length > 0,
          message: (interaction.content_excerpt ?? "").trim(),
          occurredAt: interaction.occurred_at,
          isLatestInbound: latest.data?.id === interaction.id,
          alreadyAnswered: Boolean(interaction.responded_at),
        },
      };
    },

    async claim(businessId, interactionId, skipReason) {
      const { data, error } = await crm.rpc("claim_ai_auto_reply", { p_business_id: businessId, p_interaction_id: interactionId, p_skip_reason: skipReason });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Claim | undefined;
      if (!row) throw new Error("The automatic reply could not be recorded.");
      return row;
    },

    async finish(businessId, id, patch) {
      const { error } = await crm.from("ai_auto_replies").update(patch).eq("business_id", businessId).eq("id", id);
      if (error) throw error;
    },

    async draft({ businessId, interactionId, message }) {
      const [business, settings, items] = await Promise.all([
        core.from("businesses").select("name, description, website, contact_phone, contact_email, address, opening_hours").eq("id", businessId).single(),
        core.from("business_settings").select("currency").eq("business_id", businessId).maybeSingle(),
        core.from("items").select("id, name, description, unit, selling_price, status").eq("business_id", businessId).eq("status", "active").limit(100),
      ]);
      if (business.error || !business.data) throw new Error("Could not read the business.");
      if (items.error) throw items.error;
      const facts = buildReplyFacts({
        business: business.data,
        currency: (settings.data as { currency?: string } | null)?.currency ?? null,
        items: items.data ?? [],
        knowledge: [],
        orders: [],
        jobs: [],
      });
      return runReplyDraft({
        db: crm as unknown as Parameters<typeof runReplyDraft>[0]["db"],
        aiClient: core,
        businessId,
        interactionId,
        message,
        businessName: business.data.name,
        facts,
        createdBy: null,
        operation: "auto_send_customer_reply",
      });
    },

    send(input) {
      return sendWhatsAppTextAsSystem({
        businessId: input.businessId,
        conversationId: input.conversationId,
        recipientPhone: input.recipientPhone,
        text: input.text,
        dedupeKey: `ai-auto-reply:${input.autoReplyId}`,
        metadata: { aiAutoReply: { id: input.autoReplyId, topic: input.topic, factsUsed: input.factsUsed } },
        crm,
        core,
      });
    },
  };
}
