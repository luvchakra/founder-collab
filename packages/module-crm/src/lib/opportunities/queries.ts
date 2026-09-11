import { getFsmQuoteStatus } from "@cofounderai/module-fsm/contract/index";
import type { FsmQuoteStatus } from "@cofounderai/module-fsm/contract/types";
import { createClient } from "../../db/server";
import type { Opportunity, OpportunityStage } from "./types";

/** CRM-04.2: stage configuration, stored at business level. */
export async function listStages(businessId: string): Promise<OpportunityStage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunity_stage").select("*").eq("business_id", businessId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data as OpportunityStage[];
}

export async function listOpportunities(businessId: string): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunity").select("*").eq("business_id", businessId).order("created_at", { ascending: false });
  if (error) throw error;
  return data as Opportunity[];
}

/** CRM-04.4's detail page needs a single-opportunity fetch that CRM-04.2's list view
 * (the only prior Opportunity consumer) never did. */
export async function getOpportunity(businessId: string, opportunityId: string): Promise<Opportunity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", opportunityId)
    .maybeSingle();
  if (error) throw error;
  return data as Opportunity | null;
}

/**
 * CRM-11.2's "Quote Status Projection" -- collapses `getFsmQuoteStatus()`'s
 * `ContractResult` to `null` for both "no quote created yet" (`fsmOpportunityId` unset)
 * and "FSM isn't licensed"/"call failed", same graceful-degradation shape CRM-10.2's
 * `getTotalAvailability()` already established for a different module's contract.
 */
export async function getFsmQuoteStatusForOpportunity(businessId: string, opportunity: Opportunity): Promise<FsmQuoteStatus | null> {
  if (!opportunity.fsm_opportunity_id) return null;
  const result = await getFsmQuoteStatus(businessId, opportunity.fsm_opportunity_id);
  return result.ok ? result.data : null;
}

/** CRM-11.4's own "Job Timeline in Customer 360" data source
 * (`timeline/queries.ts#listRelationshipTimeline()`) -- every one of this party's
 * opportunities that has an FSM quote, id-only (the timeline resolves each one's live
 * status itself via `getFsmQuoteStatusForOpportunity()`). */
export async function listOpportunitiesWithFsmQuoteForParty(businessId: string, partyId: string): Promise<Opportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .not("fsm_opportunity_id", "is", null);
  if (error) throw error;
  return data as Opportunity[];
}
