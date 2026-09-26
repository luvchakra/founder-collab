/**
 * DISC-OFFER-P1-01.3 "Account Watchlist" -- a founder's own deliberate "keep an eye on
 * this one" flag on a specific prospect, distinct from `opportunities.status =
 * 'watching'` (see the migration's own comment). "current score" and "last signal" are
 * NOT stored here -- see `WatchlistEntryWithProspect` below, which reads both live from
 * `discovery.prospects`/`discovery.signals` at query time instead of duplicating them
 * into a column nothing would keep fresh.
 */
export type WatchlistEntry = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  watch_reason: string;
  next_review_at: string | null;
  created_at: string;
  updated_at: string;
};

/** DISC-OFFER-P1-01.3's "next review" as something to act on: past due, due within the
 * next week, further out, or no date set. Derived from `next_review_at` at read time. */
export type WatchReviewState = "overdue" | "due_soon" | "scheduled" | "not_set";

export const WATCH_REVIEW_STATE_LABEL: Record<WatchReviewState, string> = {
  overdue: "Review overdue",
  due_soon: "Review due soon",
  scheduled: "Scheduled",
  not_set: "No review date",
};

/** The same real account watched under another of this business's offerings -- "same
 * account can be watched differently for different offerings" (DISC-OFFER-P1-01.3),
 * shown so a founder sees the other offering's own reason instead of guessing. */
export type OtherOfferingWatch = {
  productId: string;
  productName: string;
  watchReason: string;
};

/** The row a list page actually renders -- the stored entry plus the live facts read
 * off the account (prospect) it points to. `currentScore`/`lastSignalAt` are computed,
 * never stored (see types.ts's own doc comment above). */
export type WatchlistEntryWithProspect = WatchlistEntry & {
  prospectCompanyName: string;
  prospectIndustry: string | null;
  prospectDomain: string | null;
  currentScore: number | null;
  lastSignalDescription: string | null;
  lastSignalAt: string | null;
  reviewState: WatchReviewState;
};
