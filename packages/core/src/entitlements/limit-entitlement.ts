import { createClient } from "../db/server";
import { currentMonthPeriod } from "../usage/types";
import { getUsageCounter } from "../usage/queries";
import { getBusinessPlan } from "./plan-lookup";
import { isPeriodicResource, type ResourceKey } from "./resource-keys";
import type { EntitlementDecision } from "./types";

export { RESOURCE_KEYS } from "./resource-keys";
export type { ResourceKey } from "./resource-keys";

function platformClient() {
  return createClient({ schema: "platform" });
}

/**
 * PLATFORM-P0-05.2/05.3/06.1 -- `getLimit(business, resource)`, the third of
 * PLATFORM-P0-05.1's four named functions. Composes two real sources: `limit` from the
 * business's plan (`platform.plan_limits`, PLATFORM-P0-04.5/04.6) and `usage` from
 * `core.usage_counters` (PLATFORM-P0-06.1, this same run) -- looked up under the
 * `'current'` running-total period for most resources, or the current UTC calendar month
 * for the periodic-consumption subset (`isPeriodicResource()`). A resource with no
 * counter row yet reports `usage: 0` (an honest "hasn't happened yet," not a fabricated
 * number -- distinct from `plan_limits` having no row, which means something else
 * entirely, see below).
 *
 * `allowed`/`remaining` for a `limited` resource now match PLATFORM-P0-05.3's own worked
 * example verbatim (`{allowed: false, reason: "Pro plan allows 5 businesses", usage: 5,
 * remaining: 0}`): `remaining = max(limit - usage, 0)`, `allowed = usage < limit`. This
 * was the one piece PLATFORM-P0-06.1's own entry left as a documented follow-up
 * (`usage`/`remaining` were always `null` until real counters existed) -- completed here,
 * immediately after, in its own small addition rather than a rewrite, exactly as that
 * entry predicted.
 *
 * `canConsume(business, resource, quantity)` (PLATFORM-P0-05.1's fourth named function) is
 * **still not built**: real usage now exists, but `canConsume` needs to reserve/check
 * against a *prospective* quantity atomically at the point of the action (the same
 * "would consuming N more exceed the limit, right now, without a race" concern
 * PLATFORM-P0-06.3's own "enforce limits server-side" implies) -- a genuinely separate,
 * still-unbuilt piece of work from "read the current state," which is all `getLimit()`
 * does. Left to PLATFORM-P0-06.3 (Limit Enforcement) itself, the doc's own next story for
 * this exact question.
 *
 * An unconfigured (plan, resource) pair -- `platform.plan_limits` has no row for it --
 * is treated as **not restricted** (`allowed: true`, `limit: null`), not "not allowed",
 * regardless of usage. This follows the one consistent precedent every prior "config
 * doesn't exist yet" call in this exact backlog has already set: PLATFORM-P0-04.3 seeded
 * every plan x module pair `enabled = true` specifically so the table's mere existence
 * changed nothing for any business until a superadmin made a real decision;
 * PLATFORM-P0-03.3's login-branding override is opt-in and defaults to today's look for
 * the identical reason. A *configured* `disabled` state (an explicit superadmin decision)
 * still denies outright, exactly as its own tri-state design intends.
 */
export async function getLimit(businessId: string, resourceKey: ResourceKey): Promise<EntitlementDecision> {
  const plan = await getBusinessPlan(businessId);
  if (!plan) {
    return {
      allowed: false,
      reason: "This business has no resolvable plan.",
      source: "plan",
      limit: null,
      usage: null,
      remaining: null,
    };
  }

  const platform = await platformClient();
  const { data: row, error } = await platform
    .from("plan_limits")
    .select("state, limit_value")
    .eq("plan_id", plan.planId)
    .eq("resource_key", resourceKey)
    .maybeSingle();
  if (error) throw error;

  const period = isPeriodicResource(resourceKey) ? currentMonthPeriod() : "current";
  const counter = await getUsageCounter(businessId, resourceKey, period);
  const usage = counter?.count ?? 0;

  return buildLimitEntitlementDecision(resourceKey, plan.planKey, row ?? null, usage);
}

/**
 * Pure decision-composition logic, factored out for direct unit testing without a
 * database -- the same split `buildModuleEntitlementDecision()`/
 * `buildFeatureEntitlementDecision()` already established. `usage` is always a real,
 * non-negative number here (never `null`) -- the IO-touching `getLimit()` above already
 * resolved "no counter row yet" to `0` before calling this; a `null` here would only ever
 * mean "the caller didn't bother to look it up," which every real caller does.
 */
export function buildLimitEntitlementDecision(
  resourceKey: ResourceKey,
  planKey: string,
  row: { state: "limited" | "unlimited" | "disabled"; limit_value: number | null } | null,
  usage = 0,
): EntitlementDecision {
  if (!row) {
    return {
      allowed: true,
      reason: `${resourceKey} has no configured limit on the ${planKey} plan yet -- treated as unrestricted.`,
      source: "plan",
      limit: null,
      usage: null,
      remaining: null,
    };
  }
  if (row.state === "disabled") {
    return {
      allowed: false,
      reason: `${resourceKey} is disabled on the ${planKey} plan.`,
      source: "plan",
      limit: null,
      usage: null,
      remaining: null,
    };
  }
  if (row.state === "unlimited") {
    return {
      allowed: true,
      reason: `${resourceKey} is unlimited on the ${planKey} plan.`,
      source: "plan",
      limit: null,
      usage,
      remaining: null,
    };
  }
  const limit = row.limit_value as number;
  const remaining = Math.max(limit - usage, 0);
  const allowed = usage < limit;
  return {
    allowed,
    reason: allowed
      ? `${resourceKey} usage (${usage}) is within the ${planKey} plan's limit of ${limit}.`
      : `${planKey} plan allows ${limit} ${resourceKey}.`,
    source: "plan",
    limit,
    usage,
    remaining,
  };
}
