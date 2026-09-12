import { createClient } from "../../db/server";
import { computeBuyerFitScores } from "../buyer-intelligence/scoring";
import type { BuyerPersonIntelligence } from "../buyer-intelligence/types";
import type { SignalCorrelation } from "../signals/types";
import { computeNextBestAction, type NextBestActionInput } from "./next-best-action";
import { getOpportunity } from "./queries";
import { computeOpportunityScore, type ScoreComponents } from "./scoring";
import type { NextBestAction, Opportunity, OpportunityStatus } from "./types";
import { computeWhyNow } from "./why-now";

type CreateOpportunityInput = {
  prospectId: string;
  discoveryDefinitionId: string | null;
  whyThem: string | null;
  whyNow: string | null;
  recommendedAction: NextBestAction | null;
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

/**
 * DISC-OFFER-P0-05.4: "Why Now" -- writes the doc's own why_now_summary/timing_strength/
 * confidence outputs (why_now's "supporting signals"/"evidence" are already covered by
 * `correlation.signal_ids` itself, retrievable via the opportunity's own
 * `signal_correlation_id` -- no separate storage needed for those two) and wires
 * `timingScore` into the `timing` score component the same way `attachSignalCorrelation`
 * wires `signalStrength` -- reusing `setOpportunityScoreComponents` so `score` can never
 * be written except through `computeOpportunityScore`. Pass `null` for `correlation`
 * when there is nothing to base a why-now claim on (no false precision: this clears any
 * previous claim rather than leaving a stale one standing).
 */
export async function setOpportunityWhyNow(opportunityId: string, correlation: SignalCorrelation | null): Promise<Opportunity> {
  const current = await getOpportunity(opportunityId);
  if (!current) throw new Error("Opportunity not found.");

  const result = computeWhyNow(correlation);

  const supabase = await createClient();
  const { error: whyNowError } = await supabase
    .from("opportunities")
    .update({
      why_now: result.summary,
      timing_strength: result.timingStrength,
      why_now_confidence: result.confidence,
    })
    .eq("id", opportunityId);
  if (whyNowError) throw whyNowError;

  return setOpportunityScoreComponents(opportunityId, {
    icpFit: current.icp_fit_score,
    buyerFit: current.buyer_fit_score,
    needFit: current.need_fit_score,
    timing: result.timingScore,
    signalStrength: current.signal_strength_score,
    contactability: current.contactability_score,
    evidenceConfidence: current.evidence_confidence_score,
  });
}

/** DISC-OFFER-P0-08.3: also clears any recorded handoff failure -- a fresh status
 * write (including the "Send to CRM" success path setting `sent_to_crm`) means
 * whatever caused a prior failure no longer blocks this opportunity; leaving a stale
 * `handoff_failed_at` standing after a real status change would misrepresent its
 * current state. */
export async function setOpportunityStatus(opportunityId: string, status: OpportunityStatus): Promise<Opportunity> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ status, handoff_failed_at: null, handoff_error: null })
    .eq("id", opportunityId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P0-08.3: "Handoff Status" -- records an unexpected "Send to CRM" failure
 * (a thrown exception, not an `ok:false` `MODULE_NOT_LICENSED` degraded result, which
 * is a normal ADR-10 outcome, not a failure) so it survives a page reload and a founder
 * can see it and retry, rather than only a transient toast. `setOpportunityStatus`
 * above clears this the next time any status is written, including a successful retry.
 */
export async function recordOpportunityHandoffFailure(opportunityId: string, message: string): Promise<Opportunity> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ handoff_failed_at: new Date().toISOString(), handoff_error: message })
    .eq("id", opportunityId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P0-15.1: "[Edit Recommendation]" -- sets (or, with `null`, clears) a
 * founder's own manual override of the recommended next step. Deliberately touches only
 * `recommended_action_override`, never `recommended_action` itself (the system's own
 * freely-recomputed guess) or `recommended_action_reason` -- the doc's own "user edits
 * and AI-generated changes should be distinguishable" (the same line DISC-OFFER-P0-14.2
 * already built for the ICP) holds here structurally: which column is non-null says
 * which one is in effect, with no separate flag to drift out of sync.
 */
export async function setRecommendedActionOverride(opportunityId: string, override: NextBestAction | null): Promise<Opportunity> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ recommended_action_override: override })
    .eq("id", opportunityId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P0-06.2: "Offering Research Brief" -- writes a freshly-generated brief's
 * own `offering_fit` narrative into the opportunity it supports, mirroring exactly how
 * `setOpportunityWhyNow` (05.4) writes `computeWhyNow`'s summary into `why_now`. No
 * score-component wiring here, unlike `attachSignalCorrelation`/`setOpportunityWhyNow`:
 * `offering_fit` is a qualitative narrative, not a number, and inventing a 0-100 ICP-fit
 * score from prose would be exactly the false precision this module has avoided
 * everywhere else (05.2's own `computeOpportunityScore`, 05.5's negative-signal
 * detection). A real numeric `icp_fit_score` remains unpopulated until something
 * produces one honestly.
 */
export async function setOpportunityWhyThem(opportunityId: string, whyThem: string): Promise<Opportunity> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").update({ why_them: whyThem }).eq("id", opportunityId).select().single();
  if (error) throw error;
  return data;
}

/**
 * DISC-OFFER-P0-06.3: "Buyer/Person Intelligence" -- wires the strongest real candidate
 * buyer's relevance/contactability into the `buyer_fit_score`/`contactability_score`
 * components 05.2 named but nothing had populated yet (`computeBuyerFitScores`), the
 * same "write back into the existing opportunity slot" pattern `attachSignalCorrelation`
 * (05.3) and `setOpportunityWhyNow` (05.4) already established. Re-reads the
 * opportunity's other five components unchanged, so a caller still can never write
 * `score` except through `computeOpportunityScore`.
 */
export async function setOpportunityBuyerIntelligence(
  opportunityId: string,
  candidates: BuyerPersonIntelligence[],
): Promise<Opportunity> {
  const current = await getOpportunity(opportunityId);
  if (!current) throw new Error("Opportunity not found.");

  const { buyerFitScore, contactabilityScore } = computeBuyerFitScores(candidates);

  return setOpportunityScoreComponents(opportunityId, {
    icpFit: current.icp_fit_score,
    buyerFit: buyerFitScore,
    needFit: current.need_fit_score,
    timing: current.timing_score,
    signalStrength: current.signal_strength_score,
    contactability: contactabilityScore,
    evidenceConfidence: current.evidence_confidence_score,
  });
}

/**
 * DISC-OFFER-P0-07.1: "Next Best Action" -- writes `computeNextBestAction`'s own
 * recommendation and its explanation together, the same "value and its explanation
 * travel together, in one call" discipline `setOpportunityScoreComponents` already
 * established for `score`/`score_reason`. Takes the pre-built `NextBestActionInput`
 * rather than gathering it itself -- callers already have research/negative-signal/
 * contact/message state in hand from whatever triggered a recompute (mirroring
 * `setOpportunityBuyerIntelligence`'s own "caller assembles the narrow input" shape).
 */
export async function setOpportunityNextBestAction(opportunityId: string, input: NextBestActionInput): Promise<Opportunity> {
  const result = computeNextBestAction(input);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ recommended_action: result.action, recommended_action_reason: result.reason })
    .eq("id", opportunityId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
