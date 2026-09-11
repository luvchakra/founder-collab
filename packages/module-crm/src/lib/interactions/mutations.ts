import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import { matchPartyForActor } from "./matching";
import type { Interaction, RecordInteractionInput } from "./types";

const POSTGRES_UNIQUE_VIOLATION = "23505";

async function findOrCreateConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  input: RecordInteractionInput,
): Promise<string> {
  if (input.conversationId) return input.conversationId;
  if (!input.partyId) {
    throw new Error("recordInteraction: either conversationId or partyId is required to find or create a conversation");
  }

  const { data: existing, error: existingError } = await supabase
    .from("conversation")
    .select("id")
    .eq("business_id", businessId)
    .eq("party_id", input.partyId)
    .eq("primary_channel", input.channel)
    .neq("status", "resolved")
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("conversation")
    .insert({ business_id: businessId, party_id: input.partyId, primary_channel: input.channel })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

/** CRM-01.6: retries a previously `failed` outbound interaction under the same
 * `clientDedupeKey` -- updates the row's content in place (the caller is presumably
 * re-sending with the same or corrected content) and clears the failure rather than
 * inserting a second row for the same logical send attempt. */
async function retryFailedInteraction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  existing: Interaction,
  input: RecordInteractionInput,
): Promise<Interaction> {
  const { data, error } = await supabase
    .from("interaction")
    .update({
      content_reference: input.contentReference ?? existing.content_reference,
      content_excerpt: input.contentExcerpt ?? existing.content_excerpt,
      media_reference: input.mediaReference ?? existing.media_reference,
      metadata: input.metadata ?? existing.metadata,
      status: "received",
    })
    .eq("id", existing.id)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Interaction;
}

/** CRM-01.6: "failure states are visible and retryable." Marks an interaction (an
 * outbound send that failed, most often) `failed` with a human-readable reason recorded
 * in `metadata.failureReason` -- visible to any UI reading the interaction, and
 * retryable by calling `recordInteraction()` again with the same `clientDedupeKey`. */
export async function markInteractionFailed(businessId: string, interactionId: string, reason: string): Promise<Interaction> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("interaction")
    .select("metadata")
    .eq("id", interactionId)
    .eq("business_id", businessId)
    .single();
  if (existingError) throw existingError;

  const { data, error } = await supabase
    .from("interaction")
    .update({ status: "failed", metadata: { ...existing.metadata, failureReason: reason } })
    .eq("id", interactionId)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Interaction;
}

/**
 * CRM-01.3's `recordInteraction()` contract operation -- the one entry point any module
 * (or a future inbound webhook) uses to log an interaction against the shared
 * provider-neutral model (CRM-01.5). Finds or creates a conversation when the caller
 * doesn't already have one, then inserts the interaction. When the caller supplies
 * `externalActorId` but not `partyId`, CRM-06.4's match hierarchy
 * (`matching.ts#matchPartyForActor()`) runs first to try to resolve one automatically;
 * an unmatched sender still needs `conversationId` or `partyId` from the caller today
 * (relaxing that -- letting a genuinely unresolved sender start a party-less
 * conversation as an "unresolved contact candidate" -- is CRM-07.4's own acceptance
 * criterion, once a live inbound channel exists to drive it, not this function's).
 *
 * CRM-01.6 idempotency has two mechanisms, for the two cases that need different ones:
 * - **Inbound / already has a provider id**: `crm.interaction`'s own partial unique
 *   index on (business_id, channel, external_message_id) is the source of truth. A
 *   duplicate delivery (replayed webhook) hits that constraint and this function returns
 *   the already-recorded row instead of erroring or duplicating the timeline.
 * - **Outbound / not sent yet**: the provider hasn't assigned a message id yet, so
 *   `external_message_id` can't dedupe a retried send. `clientDedupeKey` (a key the
 *   caller generates once per logical send attempt and reuses across retries of that
 *   same attempt) is checked first: an existing row under that key that is NOT `failed`
 *   is returned as-is (the send already succeeded, don't send again); one that IS
 *   `failed` is updated in place and effectively retried (CRM-01.6's "failure states are
 *   visible and retryable" -- see `markInteractionFailed()` below for how a row gets
 *   into that state).
 *
 * Either path is deliberately silent about re-publishing `crm.interaction.received`/
 * `crm.conversation.updated` (CRM-01.4's events fire only on the genuine-insert path).
 */
export async function recordInteraction(businessId: string, input: RecordInteractionInput): Promise<Interaction> {
  const supabase = await createClient();

  if (input.clientDedupeKey) {
    const { data: existing, error: existingError } = await supabase
      .from("interaction")
      .select("*")
      .eq("business_id", businessId)
      .eq("client_dedupe_key", input.clientDedupeKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.status !== "failed") return existing as Interaction;
    if (existing) return retryFailedInteraction(supabase, businessId, existing as Interaction, input);
  }

  // CRM-06.4: only run the match hierarchy when the caller doesn't already know the
  // party -- a caller with a real partyId (e.g. a manually-logged reply, CRM-03.2)
  // already resolved this itself and matching would be redundant work at best.
  let resolvedPartyId = input.partyId ?? null;
  if (!resolvedPartyId && input.externalActorId) {
    const match = await matchPartyForActor(businessId, {
      channel: input.channel,
      externalActorId: input.externalActorId,
      phone: input.senderPhone,
      email: input.senderEmail,
    });
    resolvedPartyId = match.partyId;
  }
  const resolvedInput = { ...input, partyId: resolvedPartyId };

  const conversationId = await findOrCreateConversation(supabase, businessId, resolvedInput);

  const row = {
    business_id: businessId,
    conversation_id: conversationId,
    party_id: resolvedPartyId,
    channel: input.channel,
    external_actor_id: input.externalActorId ?? null,
    external_message_id: input.externalMessageId ?? null,
    client_dedupe_key: input.clientDedupeKey ?? null,
    direction: input.direction,
    interaction_type: input.interactionType ?? "message",
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    content_reference: input.contentReference ?? null,
    content_excerpt: input.contentExcerpt ?? null,
    media_reference: input.mediaReference ?? null,
    requires_response: input.requiresResponse ?? false,
    source_module: input.sourceModule ?? null,
    source_reference: input.sourceReference ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase.from("interaction").insert(row).select("*").single();
  if (error) {
    if (error.code === POSTGRES_UNIQUE_VIOLATION && input.externalMessageId) {
      const { data: existing, error: existingError } = await supabase
        .from("interaction")
        .select("*")
        .eq("business_id", businessId)
        .eq("channel", input.channel)
        .eq("external_message_id", input.externalMessageId)
        .single();
      if (existingError) throw existingError;
      return existing as Interaction;
    }
    throw error;
  }

  const { data: conversation, error: conversationUpdateError } = await supabase
    .from("conversation")
    .update({ last_interaction_at: row.occurred_at })
    .eq("id", conversationId)
    .select("status")
    .single();
  if (conversationUpdateError) throw conversationUpdateError;

  if (input.direction === "inbound") {
    await publishCrmEvent(businessId, "crm.interaction.received", {
      v: 1,
      interactionId: data.id,
      conversationId,
      channel: input.channel,
      requiresResponse: row.requires_response,
    });
  }
  await publishCrmEvent(businessId, "crm.conversation.updated", { v: 1, conversationId, status: conversation.status });

  return data as Interaction;
}
