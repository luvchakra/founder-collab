/**
 * DISC-OFFER-P1 §7-01.3 "Account Watchlist" -- a founder's own deliberate "keep an eye
 * on this one" flag on a specific prospect, distinct from `opportunities.status =
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

/** The row a list page actually renders -- the stored entry plus the live facts read
 * off the account (prospect) it points to. `currentScore`/`lastSignalAt` are computed,
 * never stored (see types.ts's own doc comment above). */
export type WatchlistEntryWithProspect = WatchlistEntry & {
  prospectCompanyName: string;
  prospectIndustry: string | null;
  currentScore: number | null;
  lastSignalDescription: string | null;
  lastSignalAt: string | null;
};
