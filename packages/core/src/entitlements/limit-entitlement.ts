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
function coreClient() {
  return createClient({ schema: "core" });
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
 * built further down this file, by PLATFORM-P0-06.3 (Limit Enforcement) -- see its own
 * docstring for why it needed a dedicated atomic SQL function rather than reusing this
 * one's read-then-decide shape.
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
 *
 * PLATFORM-P0-06.5 decision #1 (Soft vs Hard Limits): a `limited` row's own `limit_type`
 * ('soft' | 'hard', PLATFORM-P0-06.5's own new column) changes what happens once usage is
 * at or over `limit_value` -- a 'hard' limit (the default) denies exactly as before; a
 * 'soft' one still reports `allowed: true`, with `reason` saying the business is over its
 * plan's guideline rather than claiming it fits within a limit it plainly doesn't. See
 * `buildLimitEntitlementDecision()` below for the exact branch.
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
    .select("state, limit_value, limit_type")
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
  row: { state: "limited" | "unlimited" | "disabled"; limit_value: number | null; limit_type?: "soft" | "hard" | null } | null,
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
  const limitType = row.limit_type ?? "hard";
  const remaining = Math.max(limit - usage, 0);
  const atOrOverLimit = usage >= limit;

  if (limitType === "soft") {
    // Decision #1: a soft limit never blocks. Below its guideline it reads exactly like a
    // hard limit's own "within" case; at or over, the action is still allowed -- only the
    // reason text changes, from denial copy to a guideline notice.
    return {
      allowed: true,
      reason: atOrOverLimit
        ? `${resourceKey} usage (${usage}) is over your ${planKey} plan's guideline of ${limit}.`
        : `${resourceKey} usage (${usage}) is within the ${planKey} plan's limit of ${limit}.`,
      source: "plan",
      limit,
      usage,
      remaining,
    };
  }

  const allowed = !atOrOverLimit;
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

type ConsumeAttempt = {
  state: "limited" | "unlimited" | "disabled" | "unrestricted";
  limit_value: number | null;
  limit_type?: "soft" | "hard" | null;
  usage_before: number;
  usage_after: number;
  granted: boolean;
};

/**
 * PLATFORM-P0-06.3 (Limit Enforcement, §10) -- `canConsume(business, resource, quantity)`,
 * PLATFORM-P0-05.1's fourth and final named entitlement-service function. "Enforce limits
 * server-side. UI-only restrictions are not sufficient" (the story's own words) means a
 * caller must be able to ask, at the exact moment it is about to perform a countable
 * action, "would this be allowed" and have the answer and the actual reservation of that
 * usage happen as one atomic step -- not two separate calls (`getLimit()` then
 * `incrementUsageCounter()`) that could race against a concurrent request for the same
 * business and resource.
 *
 * The atomicity itself lives in `core.try_consume_usage_counter()`
 * (`20260912100000_core_try_consume_usage_counter.sql`, this same story): one
 * SECURITY DEFINER function, one transaction, a row-level lock (`for update`) on the
 * counter row while it decides and (if granted) writes the new count. This function is a
 * thin wrapper that resolves the business's plan (for the decision's own `reason` text,
 * matching every sibling entitlement function's convention), calls that RPC once, and
 * shapes the result through the pure `buildConsumeEntitlementDecision()` below -- the same
 * "IO-touching caller, pure decision-shaper" split `getLimit()`/
 * `buildLimitEntitlementDecision()` already established.
 *
 * `quantity` defaults to `1` (the common "about to create one more of this" case).
 * Unlike `getLimit()`, a *granted* call here has a real side effect: it increments
 * `core.usage_counters` by `quantity`. A *denied* call has no side effect at all -- the
 * counter is left exactly as it was (the whole point of doing the check and the write in
 * one atomic step). Callers that only want to inspect current standing without consuming
 * anything should call `getLimit()` instead.
 *
 * PLATFORM-P0-06.5 decision #1: a `limited` resource whose `limit_type` is 'soft' is
 * always granted by `core.try_consume_usage_counter()` itself now, with no ceiling --
 * see `buildConsumeEntitlementDecision()` below for how that shows up in the decision's
 * own `reason` text once usage lands at or over the (still-real, still-reported) guideline.
 */
export async function canConsume(businessId: string, resourceKey: ResourceKey, quantity = 1): Promise<EntitlementDecision> {
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

  const period = isPeriodicResource(resourceKey) ? currentMonthPeriod() : "current";
  const core = await coreClient();
  const { data, error } = await core
    .rpc("try_consume_usage_counter", {
      p_business_id: businessId,
      p_resource_key: resourceKey,
      p_quantity: quantity,
      p_period: period,
    })
    .single();
  if (error) throw error;

  return buildConsumeEntitlementDecision(resourceKey, plan.planKey, data as ConsumeAttempt, quantity);
}

/**
 * Pure decision-composition logic for `canConsume()`, factored out for direct unit
 * testing without a database -- the same split `buildLimitEntitlementDecision()`/
 * `buildFeatureEntitlementDecision()`/`buildModuleEntitlementDecision()` already
 * established. `attempt` is `core.try_consume_usage_counter()`'s own raw result: it has
 * already decided `granted` and already performed the write (if granted) by the time this
 * function sees it -- this only turns that fact into PLATFORM-P0-05.3's own
 * `{allowed, reason, source, limit, usage, remaining}` shape.
 *
 * A denied attempt reports `usage`/`remaining` as of *before* the attempt (`usage_before`)
 * -- nothing changed, so that is the business's real current standing; a granted attempt
 * reports `usage_after`, the new real count including this consumption, matching
 * `getLimit()`'s own "usage is always the real current count" convention.
 */
export function buildConsumeEntitlementDecision(
  resourceKey: ResourceKey,
  planKey: string,
  attempt: ConsumeAttempt,
  quantity: number,
): EntitlementDecision {
  if (attempt.state === "disabled") {
    return {
      allowed: false,
      reason: `${resourceKey} is disabled on the ${planKey} plan.`,
      source: "plan",
      limit: null,
      usage: null,
      remaining: null,
    };
  }
  if (attempt.state === "unrestricted") {
    return {
      allowed: true,
      reason: `${resourceKey} has no configured limit on the ${planKey} plan yet -- treated as unrestricted.`,
      source: "plan",
      limit: null,
      usage: attempt.usage_after,
      remaining: null,
    };
  }
  if (attempt.state === "unlimited") {
    return {
      allowed: true,
      reason: `${resourceKey} is unlimited on the ${planKey} plan.`,
      source: "plan",
      limit: null,
      usage: attempt.usage_after,
      remaining: null,
    };
  }

  const limit = attempt.limit_value as number;
  const limitType = attempt.limit_type ?? "hard";

  if (limitType === "soft") {
    // Decision #1: a soft limit never blocks -- `core.try_consume_usage_counter()` itself
    // always grants this branch. Only the reason text distinguishes "still under the
    // guideline" from "over it"; both are `allowed: true`.
    const overGuideline = attempt.usage_after >= limit;
    return {
      allowed: true,
      reason: overGuideline
        ? `Consuming ${quantity} ${resourceKey} takes usage (${attempt.usage_after}) over the ${planKey} plan's guideline of ${limit}.`
        : `Consuming ${quantity} ${resourceKey} keeps usage (${attempt.usage_after}) within the ${planKey} plan's limit of ${limit}.`,
      source: "plan",
      limit,
      usage: attempt.usage_after,
      remaining: Math.max(limit - attempt.usage_after, 0),
    };
  }

  if (attempt.granted) {
    return {
      allowed: true,
      reason: `Consuming ${quantity} ${resourceKey} keeps usage (${attempt.usage_after}) within the ${planKey} plan's limit of ${limit}.`,
      source: "plan",
      limit,
      usage: attempt.usage_after,
      remaining: Math.max(limit - attempt.usage_after, 0),
    };
  }
  return {
    allowed: false,
    reason: `${planKey} plan allows ${limit} ${resourceKey}; consuming ${quantity} more would exceed it.`,
    source: "plan",
    limit,
    usage: attempt.usage_before,
    remaining: Math.max(limit - attempt.usage_before, 0),
  };
}
