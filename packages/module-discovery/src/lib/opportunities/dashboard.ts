import type { OpportunityPriority, OpportunityStatus } from "./types";

/** DISC-OFFER-P0-07.2: "Today's Opportunities" -- the doc's own exact five dashboard
 * bins. Distinct from `OpportunityStatus` (the lifecycle a founder can set by hand):
 * this is a read-time classification for *where an opportunity shows up on the
 * dashboard*, recomputed from status/score/priority every render rather than stored --
 * the same "computed fresh, never persisted" discipline `getBuyingCommitteeForProspect`
 * (06.2) and `getBuyerIntelligenceForProspect` (06.3) already established for read-only
 * derived views. A resolved opportunity (`sent_to_crm`/`dismissed`/`expired`) has no
 * bin at all -- this is an *active-work* dashboard, not a full history. */
export type DashboardBin = "hot" | "needs_review" | "new" | "watching" | "insufficient_evidence";

export const DASHBOARD_BIN_LABEL: Record<DashboardBin, string> = {
  hot: "Hot",
  needs_review: "Needs Review",
  new: "New",
  watching: "Watching",
  insufficient_evidence: "Insufficient Evidence",
};

/** The doc's own bin order -- Hot first (most urgent), Insufficient Evidence last
 * (least actionable). Dashboard rendering iterates this list rather than an arbitrary
 * object key order. */
export const DASHBOARD_BIN_ORDER: DashboardBin[] = ["hot", "needs_review", "new", "watching", "insufficient_evidence"];

const HOT_SCORE_THRESHOLD = 75;

/**
 * DISC-OFFER-P0-07.2: deterministic, no AI call (CLAUDE.md dev principle #4/#5) -- a
 * plain function of status/score/priority, never a model's own judgment call. `watching`
 * status always keeps its own bin (a founder explicitly chose to watch it, independent
 * of how it currently scores); a null score (05.2's own "insufficient evidence" case)
 * always lands in Insufficient Evidence regardless of status, since there is nothing
 * real to judge urgency from yet. Otherwise `new`/`reviewing`/`action_required` opportunities
 * split into Hot (high priority or a strong score) vs. their own resting bin.
 */
export function classifyOpportunityForDashboard(input: {
  status: OpportunityStatus;
  score: number | null;
  priority: OpportunityPriority;
}): DashboardBin | null {
  const { status, score, priority } = input;

  if (status === "sent_to_crm" || status === "dismissed" || status === "expired") return null;
  if (status === "watching") return "watching";
  if (score === null) return "insufficient_evidence";

  const isHot = priority === "high" || score >= HOT_SCORE_THRESHOLD;
  if (status === "action_required" || status === "reviewing") {
    return isHot ? "hot" : "needs_review";
  }
  // status === "new"
  return isHot ? "hot" : "new";
}
