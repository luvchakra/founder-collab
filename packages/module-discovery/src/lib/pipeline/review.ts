/**
 * DISC-OFFER-P1-02.1: "Review Required Indicators" -- the doc's own three-symbol legend
 * ("✓ High confidence — automated", "⚠ Needs review", "? Insufficient evidence"),
 * applied to a pipeline stage's own just-finished result. `discovery.pipeline_stages`'s
 * own six-state status vocabulary already anticipated this exactly: `needs_review` was
 * added by DISC-OFFER-P0-10.2 with its own comment naming this story as "the story that
 * actually decides when a stage's own result is uncertain enough to land there instead of
 * `completed`." This module adds the doc's own third, narrower state
 * (`insufficient_evidence` -- a stage that ran and genuinely found nothing to work with,
 * a different fact from one that found something but it's weak) as an additive widening
 * of that same column, the same "widen a check constraint for a real third state"
 * precedent DISC-OFFER-P0-01.1 already established for `products.status`. See this
 * story's own migration for that widening.
 *
 * "The user can still edit any stage" holds structurally -- this classification only
 * ever changes which terminal status an already-completed stage attempt is recorded
 * under (`completed` vs. `needs_review` vs. `insufficient_evidence`); it never blocks the
 * pipeline from continuing (DISC-OFFER-P0-11.x's own dependency/downstream logic and
 * `display-groups.ts`'s own "done" check treat all three exactly alike -- see that
 * file's own `isStageStatusDone`), and it never touches what a stage actually computed or
 * any existing edit/approve affordance elsewhere in this module.
 */
export type StageReviewLevel = "automated" | "needs_review" | "insufficient_evidence";

export const STAGE_REVIEW_LABEL: Record<StageReviewLevel, string> = {
  automated: "High confidence — automated",
  needs_review: "Needs review",
  insufficient_evidence: "Insufficient evidence",
};

const REVIEW_LEVEL_RANK: Record<StageReviewLevel, number> = {
  automated: 0,
  needs_review: 1,
  insufficient_evidence: 2,
};

/**
 * The worst (most attention-needing) level across several independent readings a
 * stage's own run touched (e.g. one opportunity per account it correlated/researched
 * this run) -- "a single weak signal should not be hidden behind several strong ones,"
 * the same worst-wins discipline DISC-OFFER-P0-05.4's own `confidence` (the weaker of
 * timing strength and correlation confidence) already established for Why Now. An empty
 * list -- nothing this stage actually assessed this run -- is `automated`: nothing found
 * means nothing new to flag, not evidence of a problem.
 */
export function worstReviewLevel(levels: StageReviewLevel[]): StageReviewLevel {
  return levels.reduce<StageReviewLevel>(
    (worst, level) => (REVIEW_LEVEL_RANK[level] > REVIEW_LEVEL_RANK[worst] ? level : worst),
    "automated",
  );
}

/**
 * For the two stages whose own AI output already carries a plain 0-1 confidence number
 * (`ProductProfileSchema`/`IcpProfileSchema`'s own `confidence` field -- distinct from
 * the low/medium/high vocabulary every opportunity-shaped field below uses). Thresholds
 * are this story's own genuinely new judgment call -- the doc names no specific numbers
 * -- chosen as plain round tertiles: the bottom third reads as "barely any real signal"
 * (insufficient evidence to trust unreviewed), the top third as "clearly well-supported"
 * (safe to leave fully automated), the middle third worth a founder's second look either
 * way.
 */
export function classifyNumericConfidence(confidence: number): StageReviewLevel {
  if (confidence >= 0.7) return "automated";
  if (confidence >= 0.4) return "needs_review";
  return "insufficient_evidence";
}

/**
 * For every stage whose own output already carries this module's established
 * low/medium/high confidence vocabulary (signal correlation, why-now, research briefs,
 * opportunity scoring, buyer intelligence). `hasEvidence` is whichever null-typed
 * sibling field that stage already uses to mean "found genuinely nothing" (a null
 * correlation/timing-strength, a literal "Insufficient evidence" score reason), distinct
 * from a real-but-weak `"low"` reading on something that *was* found. `"high"` is the
 * only tier this story treats as safe to leave fully automated -- `"medium"` still gets a
 * founder's look, matching the doc's own "the user can still edit any stage" implying
 * review is the normal default for anything short of strong evidence.
 */
export function classifyEnumConfidence(confidence: "low" | "medium" | "high", hasEvidence: boolean): StageReviewLevel {
  if (!hasEvidence) return "insufficient_evidence";
  return confidence === "high" ? "automated" : "needs_review";
}

/**
 * For a stage whose own run produced a *list* of independent low/medium/high readings
 * rather than one (e.g. every evidence item a research pass turned up, or every buyer
 * candidate's own confidence) -- an empty list is `insufficient_evidence` (nothing was
 * found at all, distinct from "found something weak"), otherwise the worst reading in
 * the list decides, via `classifyEnumConfidence` above.
 */
export function classifyEvidenceConfidences(confidences: ("low" | "medium" | "high")[]): StageReviewLevel {
  if (confidences.length === 0) return "insufficient_evidence";
  const rank: Record<"low" | "medium" | "high", number> = { low: 0, medium: 1, high: 2 };
  const worst = confidences.reduce((current, next) => (rank[next] < rank[current] ? next : current));
  return classifyEnumConfidence(worst, true);
}
