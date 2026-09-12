import type { OpportunityStatus } from "./types";

/** DISC-OFFER-P0-15.1: which opportunities are still a genuinely *pending* decision --
 * deliberately narrower than `next-best-action.ts`'s own `ACTIONABLE_STATUSES` (which
 * also includes `watching`): a founder already decided to watch an opportunity, so it no
 * longer belongs in front of them as "the one thing to decide on right now." Resolved
 * statuses (`sent_to_crm`/`dismissed`/`expired`) are excluded for the same reason
 * `classifyOpportunityForDashboard` (07.2) already excludes them from every dashboard
 * bin. */
const GATE_ELIGIBLE_STATUSES: OpportunityStatus[] = ["new", "reviewing", "action_required"];

/** Only the fields the selection itself needs -- the same "narrow, testable input shape"
 * precedent `NextBestActionInput` (07.1) and `ScoreComponents` (05.2) already
 * established, rather than depending on the full `Opportunity` row (or, for the real
 * caller, the full `OpportunityDashboardRow`). */
export type GateCandidate = {
  status: OpportunityStatus;
  score: number | null;
  created_at: string;
};

/**
 * DISC-OFFER-P0-15.1: "Final Human Action Gate" -- the doc's own "Top Opportunity" card
 * is a single decision, not a list, so this picks exactly one candidate for a founder to
 * act on: the highest-scored still-pending opportunity, oldest first on a tie (it's been
 * waiting longest for a decision). An opportunity with no score yet can't be ranked
 * against one that has been (05.2's own "no false precision" -- a null score isn't "the
 * lowest possible score", it's "not yet evaluated"), so it's excluded here rather than
 * sorted to the bottom -- the gate only ever presents something real to decide on, never
 * an unscored placeholder. Returns `null` when nothing qualifies (a fresh offering, or
 * everything already resolved/watched) -- the caller renders no card at all rather than
 * an empty one.
 */
export function selectTopGateOpportunity<T extends GateCandidate>(candidates: T[]): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (!GATE_ELIGIBLE_STATUSES.includes(candidate.status) || candidate.score === null) continue;
    if (
      best === null ||
      candidate.score! > best.score! ||
      (candidate.score === best.score && candidate.created_at < best.created_at)
    ) {
      best = candidate;
    }
  }
  return best;
}
