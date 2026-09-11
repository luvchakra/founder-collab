import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import { matchPartyForActor, type CrmClientOverrides } from "./matching";
import { evaluateRequiresResponse } from "./response-rules";
import type { Interaction, RecordInteractionInput } from "./types";

const POSTGRES_UNIQUE_VIOLATION = "23505";

async function findOrCreateConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  input: RecordInteractionInput,
): Promise<string> {
  if (input.conversationId) return input.conversationId;

  if (input.partyId) {
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

  // CRM-07.4: "unmatched sender appears as unresolved contact candidate" -- no partyId
  // means matchPartyForActor() (CRM-06.4) couldn't resolve one, not that there's
  // nowhere for the message to go. A party-less conversation is dedupe'd by
  // (business_id, channel, external_actor_id) through the conversation's own
  // participant row instead of party_id, so a second message from the same still-
  // unmatched sender appends to the same conversation rather than starting a new one
  // each time; a human resolving the match later (CRM-06.4 tier 4) just sets
  // conversation.party_id, no data to migrate.
  if (input.externalActorId) {
    const { data: existingParticipant, error: participantError } = await supabase
      .from("conversation_participant")
      .select("conversation_id")
      .eq("business_id", businessId)
      .eq("external_actor_id", input.externalActorId)
      .maybeSingle();
    if (participantError) throw participantError;
    if (existingParticipant) return existingParticipant.conversation_id;

    const { data: created, error: createError } = await supabase
      .from("conversation")
      .insert({ business_id: businessId, party_id: null, primary_channel: input.channel })
      .select("id")
      .single();
    if (createError) throw createError;

    const { error: participantInsertError } = await supabase
      .from("conversation_participant")
      .insert({ business_id: businessId, conversation_id: created.id, party_id: null, external_actor_id: input.externalActorId });
    if (participantInsertError) throw participantInsertError;

    return created.id;
  }

  throw new Error("recordInteraction: either conversationId, partyId, or externalActorId is required to find or create a conversation");
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

/** CRM-07.6: the provider only assigns a message id once a send actually succeeds, after
 * `recordInteraction()` has already inserted the row (see its own doc comment on why
 * outbound sends are recorded before the send completes) -- this attaches it after the
 * fact so a later status webhook (CRM-07.3) can find this exact row by
 * `external_message_id` the same way it already does for inbound ones. */
export async function attachOutboundMessageId(businessId: string, interactionId: string, externalMessageId: string, clients?: CrmClientOverrides): Promise<void> {
  const supabase = clients?.crm ?? (await createClient());
  const { error } = await supabase.from("interaction").update({ external_message_id: externalMessageId }).eq("id", interactionId).eq("business_id", businessId);
  if (error) throw error;
}

/** CRM-01.6: "failure states are visible and retryable." Marks an interaction (an
 * outbound send that failed, most often) `failed` with a human-readable reason recorded
 * in `metadata.failureReason` -- visible to any UI reading the interaction, and
 * retryable by calling `recordInteraction()` again with the same `clientDedupeKey`. */
export async function markInteractionFailed(
  businessId: string,
  interactionId: string,
  reason: string,
  clients?: CrmClientOverrides,
): Promise<Interaction> {
  const supabase = clients?.crm ?? (await createClient());
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
 * an unmatched sender still gets a real, party-less conversation (CRM-07.4's "unmatched
 * sender appears as unresolved contact candidate") deduped by `external_actor_id`
 * through a `conversation_participant` row rather than `party_id` -- a human resolving
 * the match later just sets `conversation.party_id`, no rows to migrate.
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
 *
 * `clients` (CRM-07.3): every existing caller runs inside a logged-in user's request and
 * omits this, getting today's RLS-scoped `createClient()` exactly as before. A webhook
 * handler has no session to back that client with, so it passes its own admin/service-
 * role client here instead -- the one deliberate RLS bypass point for inbound channel
 * ingestion, same trust boundary the old ticket-based `ingestInboundCrmMessage()` used.
 */
export async function recordInteraction(
  businessId: string,
  input: RecordInteractionInput,
  clients?: CrmClientOverrides,
): Promise<Interaction> {
  const supabase = clients?.crm ?? (await createClient());

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
    const match = await matchPartyForActor(
      businessId,
      { channel: input.channel, externalActorId: input.externalActorId, phone: input.senderPhone, email: input.senderEmail },
      clients,
    );
    resolvedPartyId = match.partyId;
  }
  const resolvedInput = { ...input, partyId: resolvedPartyId };

  const conversationId = await findOrCreateConversation(supabase, businessId, resolvedInput);

  // CRM-09.1: a caller that already knows better (e.g. CRM-03.2's classification-based
  // decision) passes an explicit true/false and that wins outright; only when the caller
  // has no opinion does the deterministic rules engine decide, rather than silently
  // defaulting to `false` the way this used to.
  const requiresResponse = input.requiresResponse ?? evaluateRequiresResponse({ direction: input.direction, channel: input.channel, contentExcerpt: input.contentExcerpt });

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
    requires_response: requiresResponse,
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
  } else {
    // CRM-09.1's fourth rule, the other half of `evaluateRequiresResponse()`: "no
    // qualifying business response exists." An inbound message can't know at the moment
    // it arrives whether it'll be responded to -- this is where that becomes true. Any
    // earlier inbound interaction in the same conversation still marked
    // `requires_response` with no `responded_at` now has one, so it drops out of the
    // Potential Lost Business queue (CRM-09.2) the same instant this reply is recorded,
    // not on some later re-evaluation pass.
    const { error: respondedError } = await supabase
      .from("interaction")
      .update({ status: "responded", requires_response: false, responded_at: row.occurred_at })
      .eq("business_id", businessId)
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .eq("requires_response", true)
      .is("responded_at", null);
    if (respondedError) throw respondedError;
  }
  await publishCrmEvent(businessId, "crm.conversation.updated", { v: 1, conversationId, status: conversation.status });

  return data as Interaction;
}

/** CRM-09.1's "user can mark not actionable" -- distinct from `markInteractionFailed()`
 * (that's for a send that technically failed); this is a human judgment call that an
 * inbound message the rules engine flagged doesn't actually need a reply (e.g. a false
 * positive the deterministic rules didn't catch). Uses the interaction model's own
 * `ignored` status rather than a separate flag column. */
export async function markInteractionNotActionable(businessId: string, interactionId: string, clients?: CrmClientOverrides): Promise<Interaction> {
  const supabase = clients?.crm ?? (await createClient());
  const { data, error } = await supabase
    .from("interaction")
    .update({ status: "ignored", requires_response: false })
    .eq("id", interactionId)
    .eq("business_id", businessId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Interaction;
}
