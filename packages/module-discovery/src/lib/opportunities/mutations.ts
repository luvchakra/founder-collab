import { createClient } from "../../db/server";
import { computeOpportunityScore, type ScoreComponents } from "./scoring";
import type { Opportunity, OpportunityStatus } from "./types";

type CreateOpportunityInput = {
  prospectId: string;
  discoveryDefinitionId: string | null;
  whyThem: string | null;
  whyNow: string | null;
  recommendedAction: string | null;
};

/** No scoring logic here -- 05.2 owns computing `score`/`confidence`. This just records
 * the opportunity moment itself (why now, for whom, from which definition). */
export async function createOpportunity(workspaceId: string, input: CreateOpportunityInput): Promise<Opportunity> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .insert({
      workspace_id: workspaceId,
      prospect_id: input.prospectId,
      discovery_definition_id: input.discoveryDefinitionId,
      why_them: input.whyThem,
      why_now: input.whyNow,
      recommended_action: input.recommendedAction,
      last_evaluated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Writes the raw score components and the deterministic overall score/confidence/reason
 * computed from them in one call -- callers never write `score`/`confidence` directly,
 * so the two can't drift apart (see scoring.ts's own "no false precision" reasoning). */
export async function setOpportunityScoreComponents(opportunityId: string, components: ScoreComponents): Promise<Opportunity> {
  const supabase = await createClient();
  const result = computeOpportunityScore(components);
  const { data, error } = await supabase
    .from("opportunities")
    .update({
      icp_fit_score: components.icpFit,
      buyer_fit_score: components.buyerFit,
      need_fit_score: components.needFit,
      timing_score: components.timing,
      signal_strength_score: components.signalStrength,
      contactability_score: components.contactability,
      evidence_confidence_score: components.evidenceConfidence,
      score: result.score,
      confidence: result.confidence,
      score_reason: result.reason,
      last_evaluated_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<Opportunity> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").update({ status }).eq("id", opportunityId).select().single();
  if (error) throw error;
  return data;
}
