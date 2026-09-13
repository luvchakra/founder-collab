import { cache } from "react";
import { createClient } from "../../db/server";
import type { Opportunity } from "./types";
import { computeOpportunityOutcomeFunnel, type OpportunityOutcomeFunnel } from "./outcome-funnel";

/** cache()-wrapped for the same request-deduplication reason every other list query in
 * this module is. Ordered by score first (nulls last) so the strongest opportunities
 * surface first once a real scoring pass (05.2) starts populating them. */
export const listOpportunities = cache(async (workspaceId: string): Promise<Opportunity[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});

export const getOpportunity = cache(async (opportunityId: string): Promise<Opportunity | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").select("*").eq("id", opportunityId).maybeSingle();
  if (error) throw error;
  return data;
});

export async function listOpportunitiesForProspect(prospectId: string): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P1-04.2: "Learn From Outcomes" -- gathers the doc's own chain
 * (Opportunity → Contact → Conversation → CRM → Outcome) for one offering in four flat,
 * workspace-scoped queries rather than an N+1 per-opportunity lookup or a multi-level
 * PostgREST embed (no existing precedent for embedding `prospects` from `opportunities`
 * in this codebase to build on), then correlates them in application code -- the same
 * "separate flat queries, joined in memory" shape `listProspects`' own pipeline join
 * already uses, just without PostgREST's embed syntax doing the join for us here.
 * `computeOpportunityOutcomeFunnel` (pure, unit-tested) does the actual aggregation.
 */
export async function getOpportunityOutcomeFunnel(workspaceId: string): Promise<OpportunityOutcomeFunnel> {
  const supabase = await createClient();
  const [opportunitiesResult, prospectsResult, contactsResult, conversationsResult] = await Promise.all([
    supabase.from("opportunities").select("prospect_id, status").eq("workspace_id", workspaceId),
    supabase.from("prospects").select("id, outcome").eq("workspace_id", workspaceId),
    supabase.from("contacts").select("prospect_id").eq("workspace_id", workspaceId),
    supabase.from("conversations").select("prospect_id").eq("workspace_id", workspaceId),
  ]);
  if (opportunitiesResult.error) throw opportunitiesResult.error;
  if (prospectsResult.error) throw prospectsResult.error;
  if (contactsResult.error) throw contactsResult.error;
  if (conversationsResult.error) throw conversationsResult.error;

  const outcomeByProspectId = new Map(prospectsResult.data.map((p) => [p.id, p.outcome]));
  const prospectIdsWithContact = new Set(contactsResult.data.map((c) => c.prospect_id));
  const prospectIdsWithConversation = new Set(conversationsResult.data.map((c) => c.prospect_id));

  const facts = opportunitiesResult.data.map((opportunity) => ({
    sentToCrm: opportunity.status === "sent_to_crm",
    hasContact: prospectIdsWithContact.has(opportunity.prospect_id),
    hasConversation: prospectIdsWithConversation.has(opportunity.prospect_id),
    // A prospect deleted out from under its own opportunity is not something this schema
    // allows (opportunities.prospect_id is "on delete cascade" -- deleting a prospect
    // deletes its opportunities with it) -- "open" is only ever a defensive fallback,
    // never expected to trigger in practice.
    outcome: outcomeByProspectId.get(opportunity.prospect_id) ?? ("open" as const),
  }));

  return computeOpportunityOutcomeFunnel(facts);
}
