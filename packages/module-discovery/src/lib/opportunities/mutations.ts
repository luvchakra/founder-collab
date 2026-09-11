import { createClient } from "../../db/server";
import type { SignalCorrelation } from "../signals/types";
import { getOpportunity } from "./queries";
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

const CORRELATION_CONFIDENCE_TO_SIGNAL_STRENGTH: Record<SignalCorrelation["confidence"], number> = {
  low: 30,
  medium: 60,
  high: 90,
};

/**
 * DISC-OFFER-P0-05.3: wires a computed signal correlation into the opportunity it
 * supports. The doc's own pipeline order ("Signals -> Signal Correlation -> Opportunity
 * Scoring") means a correlation's confidence is exactly the "signal strength" evidence
 * 05.2's own scoring model already named a slot for but nothing had populated yet.
 * Re-reads the opportunity's own current six other components and passes them through
 * unchanged into `setOpportunityScoreComponents` -- the only thing this call changes is
 * `signalStrength`, never a component some other stage (05.4 Why Now, 05.5 Negative
 * Signals, 06.x Research) may have already set.
 */
export async function attachSignalCorrelation(opportunityId: string, correlation: SignalCorrelation): Promise<Opportunity> {
  const current = await getOpportunity(opportunityId);
  if (!current) throw new Error("Opportunity not found.");

  const supabase = await createClient();
  const { error: linkError } = await supabase
    .from("opportunities")
    .update({ signal_correlation_id: correlation.id })
    .eq("id", opportunityId);
  if (linkError) throw linkError;

  return setOpportunityScoreComponents(opportunityId, {
    icpFit: current.icp_fit_score,
    buyerFit: current.buyer_fit_score,
    needFit: current.need_fit_score,
    timing: current.timing_score,
    signalStrength: CORRELATION_CONFIDENCE_TO_SIGNAL_STRENGTH[correlation.confidence],
    contactability: current.contactability_score,
    evidenceConfidence: current.evidence_confidence_score,
  });
}

export async function setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<Opportunity> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").update({ status }).eq("id", opportunityId).select().single();
  if (error) throw error;
  return data;
}
