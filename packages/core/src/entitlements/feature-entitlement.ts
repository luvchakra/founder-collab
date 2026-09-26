import { createClient } from "../db/server";
import { hasModule } from "./module-entitlement";
import { getBusinessPlan } from "./plan-lookup";
import { buildFeatureOverrideDecision, getActiveFeatureOverride } from "./business-override";
import type { EntitlementDecision } from "./types";

function platformClient() {
  return createClient({ schema: "platform" });
}

/**
 * PLATFORM-P0-05.2/05.3 (Entitlement Precedence / Evaluation) -- `hasFeature(business,
 * feature)`, the first of PLATFORM-P0-05.1's four named functions this section's own
 * business<->plan link (this same story) unblocks. A "feature" (`platform.features`,
 * PLATFORM-P0-04.4) is explicitly "go beyond module-level licensing" -- a finer capability
 * *within* an already-licensed module (the doc's own example: Discovery licensed, but
 * "Advanced Signals" gated to higher tiers) -- so this composes exactly two layers, in
 * this order:
 *
 * 1. **License** (`hasModule()`, PLATFORM-P0-05.1): if the feature's own module isn't
 *    licensed (or is only in read-only grace) at all, there is no point asking whether a
 *    plan entitles a sub-capability of a module the business can't use in the first
 *    place -- returned as-is, `source: "license"`, matching `buildModuleEntitlementDecision()`'s
 *    own reasons verbatim so a caller sees exactly why (unlicensed vs. grace).
 * 2. **Plan** (`platform.plan_features`, PLATFORM-P0-04.4): does the business's current
 *    plan (resolved via `getBusinessPlan()`, this section's own new business<->plan link)
 *    entitle this specific feature? No `plan_features` row for (plan, feature) means "not
 *    entitled" -- the exact default `20260912060000_platform_plan_features.sql`'s own
 *    migration already documents and `test-platform-plan-features-rls.mjs` already proves
 *    ("no entitlement row exists for any plan yet -- 'not entitled' is the honest default").
 *
 * **Business Override** (PLATFORM-P1-02.1) is composed between the two: an active,
 * unexpired, unrevoked feature override granted by a superadmin allows the feature even
 * when the plan doesn't (source `business_override`). **Platform Global is not composed
 * here**, same as `hasModule()`'s own docstring explains. **User Permission is not composed
 * here either**, same
 * reasoning as `module-entitlement.ts`'s own docstring -- that axis is independently real
 * and enforced via `core.has_permission()`/`requirePermission()` at each action's own call
 * site, a different question ("can *this user* do X") from the one this function answers
 * ("is *this business* entitled to X at all").
 */
export async function hasFeature(businessId: string, moduleKey: string, featureKey: string): Promise<EntitlementDecision> {
  const moduleDecision = await hasModule(businessId, moduleKey);
  if (!moduleDecision.allowed) return moduleDecision;

  // PLATFORM-P1-02.1: a superadmin's temporary Business Override sits above the plan in
  // PLATFORM-P0-05.2's precedence chain -- but below the licence checked just above, so an
  // override never unlocks a module the business isn't licensed for.
  const override = await getActiveFeatureOverride(businessId, moduleKey, featureKey);
  if (override) return buildFeatureOverrideDecision(featureKey, override);

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
  const { data: feature, error: featureError } = await platform
    .from("features")
    .select("id, name")
    .eq("module_key", moduleKey)
    .eq("key", featureKey)
    .maybeSingle();
  if (featureError) throw featureError;
  if (!feature) {
    return buildFeatureEntitlementDecision(featureKey, null, false);
  }

  const { data: entitlement, error: entitlementError } = await platform
    .from("plan_features")
    .select("enabled")
    .eq("plan_id", plan.planId)
    .eq("feature_id", feature.id)
    .maybeSingle();
  if (entitlementError) throw entitlementError;

  return buildFeatureEntitlementDecision(feature.name, plan.planKey, Boolean(entitlement?.enabled));
}

/**
 * Pure decision-composition logic, factored out for direct unit testing without a
 * database -- the same split `buildModuleEntitlementDecision()` already established.
 * `featureName` is `null` only for an unrecognized feature key (no catalog row at all),
 * in which case the raw key is used in the reason, matching `buildModuleEntitlementDecision()`'s
 * own unknown-module fallback.
 */
export function buildFeatureEntitlementDecision(
  featureNameOrKey: string,
  planKey: string | null,
  enabled: boolean,
): EntitlementDecision {
  if (planKey === null) {
    return {
      allowed: false,
      reason: `${featureNameOrKey} is not a recognized feature.`,
      source: "plan",
      limit: null,
      usage: null,
      remaining: null,
    };
  }
  return {
    allowed: enabled,
    reason: enabled
      ? `${featureNameOrKey} is included in the ${planKey} plan.`
      : `${featureNameOrKey} is not included in the ${planKey} plan.`,
    source: "plan",
    limit: null,
    usage: null,
    remaining: null,
  };
}
