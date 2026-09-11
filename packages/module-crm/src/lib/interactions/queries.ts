import { createClient } from "../../db/server";
import type { Interaction } from "./types";

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

/** CRM-01.3's `getConversation()` contract operation. */
export async function getConversationById(businessId: string, conversationId: string) {
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

  return { ...conversation, participants: participants ?? [], interactions: (interactions ?? []) as Interaction[] };
}
