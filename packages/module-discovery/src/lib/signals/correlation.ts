import type { CorrelationConfidence, Signal } from "./types";

export type CorrelationResult = {
  signalIds: string[];
  rationale: string;
  confidence: CorrelationConfidence;
  earliestSignalAt: string;
  latestSignalAt: string;
};

/**
 * DISC-OFFER-P0-05.3: "Multi-Signal Correlation" -- deterministic, no AI call (CLAUDE.md
 * dev principle #4: don't use an LLM for a deterministic operation; #5: minimize LLM
 * calls). The doc's own example ("New CISO + 12 IAM openings + Identity modernization
 * activity = High-confidence IAM opportunity") is a joined list of the signals actually
 * found, not synthesized prose -- composing the rationale needs no model call, only the
 * signals themselves, which a prior AI research pass already extracted.
 *
 * "A single weak signal should not automatically become a high-value opportunity":
 * confidence is driven purely by how many *independent* signals corroborate each other,
 * the same count-based confidence-gating shape `computeOpportunityScore` (05.2) already
 * established -- one signal alone is held at "low" no matter how compelling it reads on
 * its own, and is labelled as such in its own rationale rather than silently scored as
 * if it were corroborated.
 */
export function correlateSignals(signals: Signal[]): CorrelationResult | null {
  if (signals.length === 0) return null;

  const byObservedAt = [...signals].sort((a, b) => a.observed_at.localeCompare(b.observed_at));

  const rationale =
    signals.length === 1
      ? `${signals[0]!.description} (single signal -- insufficient corroboration on its own)`
      : signals.map((signal) => signal.description).join(" + ");

  const confidence: CorrelationConfidence = signals.length === 1 ? "low" : signals.length === 2 ? "medium" : "high";

  return {
    signalIds: signals.map((signal) => signal.id),
    rationale,
    confidence,
    earliestSignalAt: byObservedAt[0]!.observed_at,
    latestSignalAt: byObservedAt[byObservedAt.length - 1]!.observed_at,
  };
}
