import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { toPotentialLostBusinessQueueRow, type PotentialLostBusinessQueueRow } from "./lost-business";
import type { Interaction } from "./types";
import type { Conversation, ConversationDetail, ConversationParticipant } from "../conversations/types";

/** CRM-01.3's `getOpenCommercialInteractions()` contract operation -- CRM-09's own Lost
 * Opportunity Engine (intent classification, SLA, the "Potential Lost Business" queue
 * UI) is a much later story; today "commercial" is simply `requires_response = true` and
 * not yet answered, per CRM-01.5's own `requires_response` field -- the deterministic
 * rules engine that decides *which* interactions get that flag is CRM-09.1's job, not
 * this query's. Oldest first, since an older unanswered message is the more urgent one. */
export async function getOpenCommercialInteractions(businessId: string, limit = 50): Promise<Interaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interaction")
    .select("*")
    .eq("business_id", businessId)
    .eq("requires_response", true)
    .is("responded_at", null)
    .order("occurred_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data as Interaction[];
}

export type PotentialLostBusinessQueueEntry = PotentialLostBusinessQueueRow & {
  partyName: string | null;
  opportunityValue: number | null;
  opportunityCurrency: string | null;
  ownerId: string | null;
};

/**
 * CRM-09.2's "Potential Lost Business" queue: `getOpenCommercialInteractions()` above is
 * already exactly the right base set (its own doc comment anticipated this story), joined
 * here -- via separate batched lookups, not a cross-schema embed, same established
 * pattern as `conversations/queries.ts#listConversationQueue()` -- with each interaction's
 * conversation (for `opportunity_id`/`assigned_to`), that opportunity's estimated value,
 * and the sender's party name.
 */
export async function listPotentialLostBusinessQueue(businessId: string): Promise<PotentialLostBusinessQueueEntry[]> {
  const interactions = await getOpenCommercialInteractions(businessId, 200);
  if (interactions.length === 0) return [];

  const supabase = await createClient();
  const conversationIds = [...new Set(interactions.map((i) => i.conversation_id))];
  const { data: conversations, error: conversationsError } = await supabase.from("conversation").select("id, opportunity_id, assigned_to").in("id", conversationIds);
  if (conversationsError) throw conversationsError;
  const conversationById = new Map(conversations.map((c) => [c.id, c]));

  const opportunityIds = [...new Set(conversations.map((c) => c.opportunity_id).filter((id): id is string => Boolean(id)))];
  const { data: opportunities, error: opportunitiesError } = opportunityIds.length
    ? await supabase.from("opportunity").select("id, estimated_value, currency").in("id", opportunityIds)
    : { data: [] as { id: string; estimated_value: number | null; currency: string }[], error: null };
  if (opportunitiesError) throw opportunitiesError;
  const opportunityById = new Map(opportunities.map((o) => [o.id, o]));

  const partyIds = [...new Set(interactions.map((i) => i.party_id).filter((id): id is string => Boolean(id)))];
  const core = await createCoreClient({ schema: "core" });
  const { data: parties, error: partiesError } = partyIds.length
    ? await core.from("parties").select("id, name").in("id", partyIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  const now = new Date();
  return interactions.map((interaction) => {
    const conversation = conversationById.get(interaction.conversation_id);
    const opportunity = conversation?.opportunity_id ? opportunityById.get(conversation.opportunity_id) : undefined;
    const queueRow = toPotentialLostBusinessQueueRow(
      {
        interactionId: interaction.id,
        conversationId: interaction.conversation_id,
        partyId: interaction.party_id,
        channel: interaction.channel,
        contentExcerpt: interaction.content_excerpt,
        occurredAt: interaction.occurred_at,
        intent: interaction.intent,
        opportunityId: conversation?.opportunity_id ?? null,
        responseDueAt: interaction.response_due_at,
      },
      now,
    );
    return {
      ...queueRow,
      partyName: interaction.party_id ? (partyNameById.get(interaction.party_id) ?? null) : null,
      opportunityValue: opportunity?.estimated_value ?? null,
      opportunityCurrency: opportunity?.currency ?? null,
      ownerId: conversation?.assigned_to ?? null,
    };
  });
}

/** CRM-02.3's relationship timeline needs a party's full interaction history, most
 * recent first. */
export async function listInteractionsForParty(businessId: string, partyId: string): Promise<Interaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interaction")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data as Interaction[];
}

/** CRM-01.3's `getConversation()` contract operation. Explicitly typed (not left to the
 * untyped crm-schema client's own inference) so callers -- like CRM-06.2's inbox --
 * get real `Interaction[]`/`ConversationParticipant[]` types on the result instead of
 * `any` collapsing the whole object. */
export async function getConversationById(businessId: string, conversationId: string): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversation")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", conversationId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) return null;

  const { data: participants, error: participantsError } = await supabase
    .from("conversation_participant")
    .select("*")
    .eq("conversation_id", conversationId);
  if (participantsError) throw participantsError;

  const { data: interactions, error: interactionsError } = await supabase
    .from("interaction")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: true });
  if (interactionsError) throw interactionsError;

  return {
    ...(conversation as Conversation),
    participants: (participants ?? []) as ConversationParticipant[],
    interactions: (interactions ?? []) as Interaction[],
  };
}
