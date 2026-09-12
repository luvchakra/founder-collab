import type { EntitlementDecision } from "./types";

/**
 * PLATFORM-P0-06.4 ("Graceful Limit UX", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §10) -- the doc's own worked example is a specific piece of copy:
 *
 *   You've reached your Pro plan limit of 100 active opportunities.
 *   [Upgrade] [View Usage]
 *
 * This function turns a denied `EntitlementDecision` (from `getLimit()` or
 * `canConsume()`) into that exact `{title, description}` shape -- the same
 * "raw decision in, user-facing copy out" split `not-licensed/page.tsx`'s own
 * `describeReason()` already established for the sibling "denied by licensing" case, kept
 * here rather than duplicated ad hoc by every future caller.
 *
 * Deliberately takes `resourceLabel`/`planKey` as separate arguments rather than parsing
 * them back out of `decision.reason` -- `buildLimitEntitlementDecision()`'s/
 * `buildConsumeEntitlementDecision()`'s own `reason` string is meant to be read on its own
 * (e.g. in a server log or an API error body), not string-matched by a caller; a caller
 * that already resolved a `ResourceKey` and a plan key to build the decision in the first
 * place already has both values sitting right there (`RESOURCE_LABELS[resourceKey]`,
 * `getBusinessPlan()`'s own `planKey`).
 */
export type LimitReachedCopy = {
  title: string;
  description: string;
};

export function describeLimitReached(
  decision: EntitlementDecision,
  resourceLabel: string,
  planKey: string,
): LimitReachedCopy {
  if (decision.allowed) {
    throw new Error("describeLimitReached: only meaningful for a denied EntitlementDecision (allowed: false)");
  }

  // Deliberately not lowercased for mid-sentence placement: `RESOURCE_LABELS`
  // (packages/core/src/admin/platform-limits-constants.ts) includes acronyms and a brand
  // name -- "AI runs", "API calls", "WhatsApp conversations" -- and naively lowercasing
  // just the first character would mangle every one of them ("aI runs", "aPI calls",
  // "whatsApp conversations"). A capitalized resource name mid-sentence reads fine and
  // never produces a wrong word, which a lowercasing heuristic can't guarantee here.

  // A numeric `limit` means this is genuinely "you're at the ceiling" -- the doc's own
  // worked example shape applies verbatim. A `null` limit on a denial means something
  // else entirely (the resource is `disabled` on this plan, or the business has no
  // resolvable plan at all) -- there is no "N" to report, so the copy says so plainly
  // instead of fabricating a number, per CLAUDE.md's "never fabricate data" stance
  // (dev principle 4/5) `getLimit()`'s/`canConsume()`'s own docstrings already hold to.
  if (decision.limit === null) {
    return {
      title: `${resourceLabel} isn't available on your plan`,
      description: decision.reason,
    };
  }

  return {
    title: `You've reached your ${planKey} plan limit`,
    description: `You've reached your ${planKey} plan limit of ${decision.limit} ${resourceLabel}.`,
  };
}
