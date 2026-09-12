import { createClient } from "../db/server";
import { getBusinessPlan } from "./plan-lookup";
import type { EntitlementDecision } from "./types";

function platformClient() {
  return createClient({ schema: "platform" });
}

/** The closed list `20260912050000_platform_plan_limits.sql`'s own `resource_key` CHECK
 * constraint enforces -- kept in sync with that migration by hand (both are short, static
 * lists; a real "generate types from the DB" pipeline is more machinery than this
 * function needs today, per CLAUDE.md's "simplest implementation that works"). */
export const RESOURCE_KEYS = [
  "businesses",
  "users",
  "business_offerings",
  "products",
  "contacts",
  "prospects",
  "opportunities",
  "ai_runs",
  "ai_credits",
  "whatsapp_conversations",
  "storage",
  "api_calls",
  "automation_runs",
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];

/**
 * PLATFORM-P0-05.2/05.3 (Entitlement Precedence / Evaluation) -- `getLimit(business,
 * resource)`, the third of PLATFORM-P0-05.1's four named functions. **Deliberately
 * partial**, the same honest-gap shape `hasModule()` (PLATFORM-P0-05.1) already
 * established: `limit` is real (read from the business's plan, via
 * `platform.plan_limits`, PLATFORM-P0-04.5/04.6), but `usage`/`remaining` are always
 * `null` -- PLATFORM-P0-06.1 (Usage Counters) is this run's own next section and has not
 * shipped yet, so there is no real usage number to report. Returning `0` (or any other
 * number) here would be exactly the fabricated-data failure mode this backlog's own
 * repeated stance already forbids (PLATFORM-P0-02.1's honest MRR/ARR "--",
 * PLATFORM-P0-05.1's own "never a fake number" discipline for `limit`/`usage`/`remaining`).
 *
 * `canConsume(business, resource, quantity)` (PLATFORM-P0-05.1's fourth named function) is
 * **not built in this story at all**, for the same reason taken to its logical
 * conclusion: its whole purpose ("would consuming N more exceed the limit") is
 * unanswerable without a real usage number. A stub that always answered `true` (the only
 * honest answer available with `usage: null`) would be actively unsafe once a caller
 * relies on it for PLATFORM-P0-06.3's own "enforce limits server-side" -- worse than not
 * existing yet. It is deferred to immediately after PLATFORM-P0-06.1 lands real usage
 * counters, at which point `getLimit()` itself also gets its own `usage`/`remaining`
 * filled in for the first time (a small addition to this same function, not a rewrite).
 *
 * An unconfigured (plan, resource) pair -- `platform.plan_limits` has no row for it --
 * is treated as **not restricted** (`allowed: true`, `limit: null`), not "not allowed".
 * This follows the one consistent precedent every prior "config doesn't exist yet" call
 * in this exact backlog has already set: PLATFORM-P0-04.3 seeded every plan x module pair
 * `enabled = true` specifically so the table's mere existence changed nothing for any
 * business until a superadmin made a real decision; PLATFORM-P0-03.3's login-branding
 * override is opt-in and defaults to today's look for the identical reason. Defaulting an
 * *unconfigured* limit to "deny" would silently break every business's use of a resource
 * the moment this table exists, before any superadmin has configured anything -- the
 * opposite of "safe, additive, non-speculative." A *configured* `disabled` state (an
 * explicit superadmin decision) still denies outright, exactly as its own tri-state
 * design intends.
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

  return buildLimitEntitlementDecision(resourceKey, plan.planKey, row ?? null);
}

/**
 * Pure decision-composition logic, factored out for direct unit testing without a
 * database -- the same split `buildModuleEntitlementDecision()`/
 * `buildFeatureEntitlementDecision()` already established.
 */
export function buildLimitEntitlementDecision(
  resourceKey: ResourceKey,
  planKey: string,
  row: { state: "limited" | "unlimited" | "disabled"; limit_value: number | null } | null,
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
      usage: null,
      remaining: null,
    };
  }
  return {
    allowed: true,
    reason: `${resourceKey} is limited to ${row.limit_value} on the ${planKey} plan. Usage tracking is not yet available (PLATFORM-P0-06.1).`,
    source: "plan",
    limit: row.limit_value,
    usage: null,
    remaining: null,
  };
}
