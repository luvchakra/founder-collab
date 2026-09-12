import { createClient } from "../db/server";
import { getBusinessPlan } from "../entitlements/plan-lookup";
import { buildLimitEntitlementDecision } from "../entitlements/limit-entitlement";
import { isPeriodicResource, RESOURCE_KEYS, type ResourceKey } from "../entitlements/resource-keys";
import { currentMonthPeriod } from "./types";

function platformClient() {
  return createClient({ schema: "platform" });
}
function coreClient() {
  return createClient({ schema: "core" });
}

/**
 * PLATFORM-P0-06.2 (Usage Dashboard) -- the real read-side query surface
 * PLATFORM-P0-06.1's own entry promised, now built: one row per resource dimension,
 * carrying exactly the four fields the doc's own example names -- `Current Usage`, `Plan
 * Limit`, `Remaining`, `Projected Usage` -- for a single business, using the same real
 * `getLimit()`/`getUsageCounter()` machinery every other entitlement decision already
 * uses (not a second, parallel query path).
 *
 * **Deliberately no `/platform` UI page ships with this story.** Not a blocked judgment
 * call in the PLATFORM-P0-05.1 sense (this function is fully real, fully authorized, and
 * usable today by any caller that already has a legitimate `businessId` -- a business's
 * own member reading their own usage needs no new grant at all, since
 * `core.usage_counters`/`core.business_settings`/`platform.plan_limits`'s own RLS already
 * covers exactly that path). What's missing is only a *page to reach it from*, and both
 * plausible homes for that page are genuinely someone else's future story, not an
 * invented placeholder here: a tenant-facing "my usage" settings page is naturally each
 * *module's* own future integration work (the same "each module's own future integration
 * work" this run's own PLATFORM-P0-06.1 entry already said about writing usage counters
 * in the first place -- PLATFORM-P0-06.4's own worked example, "[View Usage]," reads as a
 * business's own button, not a superadmin one); a superadmin cross-tenant *browsing* UI
 * (pick any business, then view its dashboard) would need real business search/lookup
 * across tenants, which is `core.businesses`' own RLS today has no path for at all (a
 * superadmin who isn't also an account member sees none) -- and that capability is
 * PLATFORM-P1-03.1/03.2's own explicit, deliberately-deferred future scope ("Customer
 * Search," "Customer Configuration View"). Building either one now would mean inventing,
 * unreviewed, exactly the kind of scope this run's own task brief says to stop and report
 * on rather than guess into `main` -- so this story stops at the real, decidable
 * boundary: the query surface exists and is correct; the page it will eventually sit
 * behind is not this story's call to invent.
 */
export type UsageDashboardRow = {
  resourceKey: ResourceKey;
  allowed: boolean;
  reason: string;
  currentUsage: number | null;
  limit: number | null;
  remaining: number | null;
  /** Only meaningful for a periodic-consumption resource with real usage tracked --
   * `null` for a running-total resource (there is no "trajectory" to project for "how
   * many businesses exist right now") and `null` when there is no configured limit to
   * project against (nothing to compare the projection to). A real, deterministic
   * calendar-day extrapolation (`projectedMonthlyUsage()`), never an LLM guess, per
   * CLAUDE.md principle 4. */
  projectedUsage: number | null;
};

export async function getUsageDashboard(businessId: string): Promise<UsageDashboardRow[]> {
  const plan = await getBusinessPlan(businessId);
  if (!plan) return [];

  const platform = await platformClient();
  const { data: limitRows, error: limitsError } = await platform
    .from("plan_limits")
    .select("resource_key, state, limit_value")
    .eq("plan_id", plan.planId);
  if (limitsError) throw limitsError;
  const limitsByResource = new Map((limitRows ?? []).map((r) => [r.resource_key, r]));

  const core = await coreClient();
  const { data: counterRows, error: countersError } = await core
    .from("usage_counters")
    .select("resource_key, period, count")
    .eq("business_id", businessId);
  if (countersError) throw countersError;

  const now = new Date();
  const currentMonth = currentMonthPeriod(now);

  return RESOURCE_KEYS.map((resourceKey) => {
    const periodic = isPeriodicResource(resourceKey);
    const period = periodic ? currentMonth : "current";
    const counter = (counterRows ?? []).find((c) => c.resource_key === resourceKey && c.period === period);
    const usage = counter?.count ?? 0;

    const row = limitsByResource.get(resourceKey) ?? null;
    const decision = buildLimitEntitlementDecision(resourceKey, plan.planKey, row, usage);

    const projectedUsage =
      periodic && decision.limit !== null ? projectedMonthlyUsage(usage, now) : null;

    return {
      resourceKey,
      allowed: decision.allowed,
      reason: decision.reason,
      currentUsage: decision.usage,
      limit: decision.limit,
      remaining: decision.remaining,
      projectedUsage,
    };
  });
}

/**
 * Pure, deterministic linear projection: at this pace (usage so far / calendar days
 * elapsed this UTC month), how much would this resource's usage be by month end?
 * Deliberately not an LLM estimate or a naive extrapolation library -- CLAUDE.md
 * principle 4 ("do not use an LLM for deterministic operations") and this backlog's own
 * "never fabricate data" stance both point the same direction: a real, reproducible
 * calculation from real numbers, or nothing at all.
 */
export function projectedMonthlyUsage(currentUsage: number, now: Date = new Date()): number {
  const dayOfMonth = now.getUTCDate(); // 1-31, never 0
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.round((currentUsage / dayOfMonth) * daysInMonth);
}
