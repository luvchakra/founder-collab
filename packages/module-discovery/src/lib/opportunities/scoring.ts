import type { OpportunityConfidence } from "./types";

/**
 * DISC-OFFER-P0-05.2: "Opportunity Score" -- a deterministic average over whichever of
 * the seven named components have real evidence behind them (CLAUDE.md dev principle
 * #4: don't use an LLM for a deterministic operation). "No false precision": an
 * unpopulated component is left out of the average entirely rather than treated as 0 --
 * a missing "contactability" reading isn't evidence the prospect is unreachable, it's
 * just unknown, and averaging it in as a zero would silently understate the score. With
 * zero components populated, there is no honest number to show at all -- `score` comes
 * back null, `confidence` is forced to "low", and `reason` explains why, matching the
 * doc's own literal "Score: -- / Confidence: Low / Reason: Insufficient evidence"
 * example.
 */
export type ScoreComponents = {
  icpFit: number | null;
  buyerFit: number | null;
  needFit: number | null;
  timing: number | null;
  signalStrength: number | null;
  contactability: number | null;
  evidenceConfidence: number | null;
};

export const SCORE_COMPONENT_LABEL: Record<keyof ScoreComponents, string> = {
  icpFit: "ICP fit",
  buyerFit: "Buyer fit",
  needFit: "Need/problem fit",
  timing: "Timing",
  signalStrength: "Signal strength",
  contactability: "Contactability",
  evidenceConfidence: "Evidence confidence",
};

const COMPONENT_KEYS = Object.keys(SCORE_COMPONENT_LABEL) as (keyof ScoreComponents)[];

export type ScoreResult = {
  score: number | null;
  confidence: OpportunityConfidence;
  reason: string | null;
};

export function computeOpportunityScore(components: ScoreComponents): ScoreResult {
  const populated = COMPONENT_KEYS.filter((key) => components[key] !== null);

  if (populated.length === 0) {
    return { score: null, confidence: "low", reason: "Insufficient evidence" };
  }

  const sum = populated.reduce((total, key) => total + (components[key] as number), 0);
  const score = Math.round(sum / populated.length);
  const completeness = populated.length / COMPONENT_KEYS.length;
  const confidence: OpportunityConfidence = completeness >= 1 ? "high" : completeness >= 0.5 ? "medium" : "low";
  const reason = completeness >= 1 ? null : `Based on ${populated.length} of ${COMPONENT_KEYS.length} score components`;

  return { score, confidence, reason };
}
