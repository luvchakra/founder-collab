import type { SignalCorrelation } from "../signals/types";
import type { OpportunityConfidence } from "./types";

/** Reuses `OpportunityConfidence` (low/medium/high) for both fields rather than
 * declaring two structurally-identical types under new names -- `timingStrength` and
 * `confidence` are semantically distinct concepts (see the function comment below), but
 * share the same three-tier vocabulary every other closed-vocabulary field in this
 * module already uses. */
export type WhyNowResult = {
  summary: string | null;
  timingStrength: OpportunityConfidence | null;
  confidence: OpportunityConfidence;
  /** Feeds straight into the opportunity's own `timing` score component (05.2) -- see
   * `setOpportunityWhyNow` in mutations.ts. Null exactly when `timingStrength` is null. */
  timingScore: number | null;
};

const TIMING_STRENGTH_TO_SCORE: Record<OpportunityConfidence, number> = { low: 30, medium: 60, high: 90 };
const CONFIDENCE_RANK: Record<OpportunityConfidence, number> = { low: 0, medium: 1, high: 2 };

/**
 * DISC-OFFER-P0-05.4: "Why Now" -- deterministic, no AI call (CLAUDE.md dev principle
 * #4/#5), and the doc's own "never manufacture urgency" is easiest to honor by never
 * generating free prose about urgency at all: the summary is a plain factual statement
 * of what a prior signal correlation (05.3) already found and how recently, not a
 * synthesized pitch.
 *
 * `timingStrength` is about *freshness* (how recently the supporting signals were
 * observed) -- a distinct dimension from 05.3's own `signalStrength`, which is about
 * *corroboration count*. A single very-recent signal and a three-month-old
 * triple-corroborated one are different kinds of "why now", and conflating them into
 * one number would lose exactly the information a founder needs to judge urgency.
 *
 * `confidence` takes the weaker of the two dimensions (freshness and corroboration): a
 * why-now claim resting on a stale-but-well-corroborated signal, or a fresh-but-lone
 * one, is not a *high-confidence* why-now claim either way.
 */
export function computeWhyNow(correlation: SignalCorrelation | null, now: Date = new Date()): WhyNowResult {
  if (!correlation) {
    return { summary: null, timingStrength: null, confidence: "low", timingScore: null };
  }

  const daysSinceLatest = Math.floor(
    (now.getTime() - new Date(correlation.latest_signal_at).getTime()) / 86_400_000,
  );
  const timingStrength: OpportunityConfidence = daysSinceLatest <= 7 ? "high" : daysSinceLatest <= 30 ? "medium" : "low";

  const correlationConfidence: OpportunityConfidence = correlation.confidence;
  const confidence: OpportunityConfidence =
    CONFIDENCE_RANK[timingStrength] < CONFIDENCE_RANK[correlationConfidence] ? timingStrength : correlationConfidence;

  const freshness =
    daysSinceLatest <= 0
      ? "observed today"
      : daysSinceLatest === 1
        ? "observed 1 day ago"
        : `observed ${daysSinceLatest} days ago`;

  return {
    summary: `${correlation.rationale} (most recently ${freshness})`,
    timingStrength,
    confidence,
    timingScore: TIMING_STRENGTH_TO_SCORE[timingStrength],
  };
}
