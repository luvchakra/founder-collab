import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { computeConversationFlags } from "./queue";
import type { Conversation } from "./types";
import type { ConversationQueueRow } from "./queue";

/**
 * CRM-06.2's Unified Inbox needs every conversation plus the flags its filters run
 * against -- fetched here in two batched queries (conversations, then their
 * interactions) rather than N+1 per-conversation lookups. Party names come from a
 * separate `core.parties` lookup, same not-a-join pattern this module already uses
 * throughout (customer-360, opportunities/products.ts, follow-ups/queries.ts) since
 * PostgREST embedded selects don't span schemas.
 */
export async function listConversationQueue(businessId: string): Promise<ConversationQueueRow[]> {
  const supabase = await createClient();
  const { data: conversations, error } = await supabase
    .from("conversation")
    .select("*")
    .eq("business_id", businessId)
    .order("last_interaction_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  if (conversations.length === 0) return [];

  const conversationIds = conversations.map((c) => c.id);
  const { data: interactions, error: interactionsError } = await supabase
    .from("interaction")
    .select("conversation_id, requires_response, responded_at, response_due_at, intent_confidence")
    .in("conversation_id", conversationIds);
  if (interactionsError) throw interactionsError;

  const interactionsByConversation = new Map<string, typeof interactions>();
  for (const interaction of interactions) {
    const list = interactionsByConversation.get(interaction.conversation_id) ?? [];
    list.push(interaction);
    interactionsByConversation.set(interaction.conversation_id, list);
  }

  const partyIds = [...new Set(conversations.map((c) => c.party_id).filter((id): id is string => Boolean(id)))];
  const core = await createCoreClient({ schema: "core" });
  const { data: parties, error: partiesError } = partyIds.length
    ? await core.from("parties").select("id, name").in("id", partyIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));

  const now = new Date();
  return conversations.map((conversation) => {
    const flags = computeConversationFlags(
      (interactionsByConversation.get(conversation.id) ?? []).map((i) => ({
        requiresResponse: i.requires_response,
        respondedAt: i.responded_at,
        responseDueAt: i.response_due_at,
        intentConfidence: i.intent_confidence,
      })),
      now,
    );
    return {
      ...(conversation as Conversation),
      partyName: conversation.party_id ? (partyNameById.get(conversation.party_id) ?? null) : null,
      ...flags,
    };
  });
}
