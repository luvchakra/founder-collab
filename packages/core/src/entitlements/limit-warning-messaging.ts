import type { EntitlementDecision } from "./types";

/**
 * PLATFORM-P0-06.5 decision #3 (Warning Threshold, verbatim): "UI-only, computed on the
 * fly, no schema change. Any caller already has real `usage`/`limit` from `getLimit()`
 * today -- build a 'you're approaching your limit' variant of the existing
 * `LimitReachedNotice` component ... that renders once usage crosses a threshold
 * percentage (use 80% as the fixed default ...) ... No new column, no per-plan
 * configurability, no notification/email wiring (PLATFORM-P0-11 is explicitly out of
 * scope here) -- purely a presentational threshold computed from data that already
 * exists."
 *
 * `DEFAULT_WARNING_THRESHOLD_PERCENT` is the one hardcoded constant this decision asks to
 * name clearly so it's easy to find if it's ever made configurable later -- it is not read
 * from any table, and there is deliberately no per-plan or per-resource override.
 */
export const DEFAULT_WARNING_THRESHOLD_PERCENT = 80;

/**
 * True once `usage` has crossed `thresholdPercent` of `limit` but has not yet reached it.
 * Once usage is at or over the limit, `getLimit()`/`canConsume()`'s own `decision.allowed`
 * already reflects that outcome (a denial for a hard limit, or an "over your plan's
 * guideline" allowance for a soft one, PLATFORM-P0-06.5 decision #1) and
 * `describeLimitReached()` is the right copy for that situation, not this one -- a warning
 * is specifically for "not there yet, but close." A `null` usage/limit (unlimited,
 * disabled, or unconfigured) has no ratio to compute and never warns.
 */
export function isApproachingLimit(
  usage: number | null,
  limit: number | null,
  thresholdPercent: number = DEFAULT_WARNING_THRESHOLD_PERCENT,
): boolean {
  if (usage === null || limit === null || limit <= 0) return false;
  return usage < limit && (usage / limit) * 100 >= thresholdPercent;
}

export type LimitWarningCopy = {
  title: string;
  description: string;
};

/**
 * Turns an *allowed* `EntitlementDecision` (from `getLimit()` or a granted `canConsume()`)
 * into a "you're approaching your limit" copy shape, once usage has crossed the warning
 * threshold -- `null` otherwise, so a caller can render nothing at all rather than branch
 * on an empty string. Mirrors `describeLimitReached()`'s own "raw decision in, user-facing
 * copy out" split, for the milder, still-allowed case.
 */
export function describeLimitWarning(
  decision: EntitlementDecision,
  resourceLabel: string,
  planKey: string,
  thresholdPercent: number = DEFAULT_WARNING_THRESHOLD_PERCENT,
): LimitWarningCopy | null {
  if (!isApproachingLimit(decision.usage, decision.limit, thresholdPercent)) return null;
  const limit = decision.limit as number;
  const usage = decision.usage as number;
  return {
    title: `Approaching your ${planKey} plan limit`,
    description: `You've used ${usage} of your ${planKey} plan's ${limit} ${resourceLabel} limit.`,
  };
}
