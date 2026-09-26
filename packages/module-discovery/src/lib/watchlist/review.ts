import { accountKeyFor } from "../portfolio/accounts";
import type { OtherOfferingWatch, WatchReviewState } from "./types";

const DAY_MS = 86_400_000;
/** "Due soon" horizon -- a week, the shortest watch cadence a founder is likely to set. */
export const REVIEW_DUE_SOON_DAYS = 7;

/**
 * DISC-OFFER-P1-01.3: where a watched account's "next review" stands. Deterministic, no
 * stored flag -- the date is the fact, the state is read off it against `now`. A review
 * date earlier today counts as overdue: the founder asked to look at it by then.
 */
export function computeWatchReviewState(nextReviewAt: string | null, now: Date): WatchReviewState {
  if (!nextReviewAt) return "not_set";
  const due = new Date(nextReviewAt).getTime();
  if (Number.isNaN(due)) return "not_set";
  if (due <= now.getTime()) return "overdue";
  if (due - now.getTime() <= REVIEW_DUE_SOON_DAYS * DAY_MS) return "due_soon";
  return "scheduled";
}

const REVIEW_STATE_ORDER: Record<WatchReviewState, number> = { overdue: 0, due_soon: 1, scheduled: 2, not_set: 3 };

/**
 * The order a watchlist is worked in: overdue reviews first (the longest-overdue at the
 * top), then those due soon, then later ones by date, then entries with no review date
 * (newest first). Returns a new array.
 */
export function sortWatchlistRows<T extends { reviewState: WatchReviewState; next_review_at: string | null; created_at: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const byState = REVIEW_STATE_ORDER[a.reviewState] - REVIEW_STATE_ORDER[b.reviewState];
    if (byState !== 0) return byState;
    if (a.next_review_at && b.next_review_at) return a.next_review_at.localeCompare(b.next_review_at);
    return b.created_at.localeCompare(a.created_at);
  });
}

/**
 * DISC-OFFER-P1-01.3 "Same account can be watched differently for different offerings":
 * for each account watched under this offering, the watches the same real account has
 * under this business's OTHER offerings. Accounts are matched with the Cross-Offering
 * Account View's own exact `accountKeyFor` (domain, else normalized name), so the two
 * views never disagree about which rows are the same company. Keyed by this offering's
 * prospect id; accounts watched only here are absent.
 */
export function findOtherOfferingWatches(
  current: { prospectId: string; companyName: string; domain: string | null }[],
  elsewhere: { productId: string; productName: string; companyName: string; domain: string | null; watchReason: string }[],
): Map<string, OtherOfferingWatch[]> {
  const byKey = new Map<string, OtherOfferingWatch[]>();
  for (const watch of elsewhere) {
    const key = accountKeyFor({ company_name: watch.companyName, domain: watch.domain });
    const list = byKey.get(key) ?? [];
    list.push({ productId: watch.productId, productName: watch.productName, watchReason: watch.watchReason });
    byKey.set(key, list);
  }

  const result = new Map<string, OtherOfferingWatch[]>();
  for (const row of current) {
    const matches = byKey.get(accountKeyFor({ company_name: row.companyName, domain: row.domain }));
    if (matches && matches.length > 0) {
      result.set(row.prospectId, [...matches].sort((a, b) => a.productName.localeCompare(b.productName)));
    }
  }
  return result;
}
