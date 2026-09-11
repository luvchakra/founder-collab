import { createClient } from "../../db/server";
import type { Customer360 } from "./types";

const RECENT_CONVERSATIONS_LIMIT = 5;

/** CRM-01.3's `getCustomer360()` contract operation -- see ./types.ts's own doc comment
 * for why this is scoped to CRM's own tables only, not the full cross-module panel. */
export async function getCustomer360(businessId: string, partyId: string): Promise<Customer360> {
  const supabase = await createClient();

  const { data: openLeads, error: leadsError } = await supabase
    .from("lead")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .not("status", "in", "(won,lost,disqualified)");
  if (leadsError) throw leadsError;

  const { data: openOpportunities, error: opportunitiesError } = await supabase
    .from("opportunity")
    .select("id, status, stage_id, created_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "open");
  if (opportunitiesError) throw opportunitiesError;

  const { data: openFollowUps, error: followUpsError } = await supabase
    .from("follow_up")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });
  if (followUpsError) throw followUpsError;

  const { data: recentConversations, error: conversationsError } = await supabase
    .from("conversation")
    .select("id, primary_channel, status, last_interaction_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("last_interaction_at", { ascending: false, nullsFirst: false })
    .limit(RECENT_CONVERSATIONS_LIMIT);
  if (conversationsError) throw conversationsError;

  return {
    partyId,
    openLeads: openLeads ?? [],
    openOpportunities: (openOpportunities ?? []).map((o) => ({ id: o.id, status: o.status, stageId: o.stage_id, createdAt: o.created_at })),
    openFollowUps: openFollowUps ?? [],
    recentConversations: (recentConversations ?? []).map((c) => ({
      id: c.id,
      primaryChannel: c.primary_channel,
      status: c.status,
      lastInteractionAt: c.last_interaction_at,
    })),
  };
}
