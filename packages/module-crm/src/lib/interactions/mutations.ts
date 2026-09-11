import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
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

/**
 * CRM-01.3's `recordInteraction()` contract operation -- the one entry point any module
 * (or a future inbound webhook) uses to log an interaction against the shared
 * provider-neutral model (CRM-01.5). Finds or creates a conversation when the caller
 * doesn't already have one (simple party+channel match -- CRM-06.4's own richer matching
 * hierarchy comes later), then inserts the interaction.
 *
 * CRM-01.6 idempotency: `crm.interaction`'s own partial unique index on
 * (business_id, channel, external_message_id) is the source of truth. A duplicate
 * delivery (replayed webhook, retried send) hits that constraint and this function
 * returns the already-recorded row instead of erroring or duplicating the timeline --
 * and, deliberately, without re-publishing `crm.interaction.received`/
 * `crm.conversation.updated` a second time for it (CRM-01.4's events are emitted only on
 * the genuine-insert path below, never on the dedup-return path).
 */
export async function recordInteraction(businessId: string, input: RecordInteractionInput): Promise<Interaction> {
  const supabase = await createClient();
  const conversationId = await findOrCreateConversation(supabase, businessId, input);

  const row = {
    business_id: businessId,
    conversation_id: conversationId,
    party_id: input.partyId ?? null,
    channel: input.channel,
    external_actor_id: input.externalActorId ?? null,
    external_message_id: input.externalMessageId ?? null,
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
