import { createClient } from "../db/server";

function coreClient() {
  return createClient({ schema: "core" });
}
function platformClient() {
  return createClient({ schema: "platform" });
}

/**
 * PLATFORM-P0-05.2 (Entitlement Precedence) -- the shared "which plan is this business
 * on" lookup `hasFeature()`/`getLimit()` both need, now that
 * `20260912070000_core_business_settings_plan_fk.sql` (this section's own schema
 * foundation story) guarantees every business has a `core.business_settings` row whose
 * `plan` column is a real, valid `platform.plans.key`.
 *
 * Both reads run through the request-scoped, cookie-authenticated client -- RLS is the
 * real gate, same as every other query in this package. `core.business_settings`'s own
 * "members can view their business settings" policy (C-2) scopes the first read to the
 * caller's own business; `platform.plans`' new "authenticated users can view the plan
 * catalog" policy (this same story's own migration,
 * `20260912080000_platform_catalog_authenticated_read.sql`) is what makes the second read
 * possible for an ordinary business member at all -- the catalog itself was superadmin-
 * read-only until this section needed an entitlement decision to actually reference it.
 *
 * Returns `null` if either read comes back empty (a business RLS excludes the caller
 * from, or -- defensively, should never happen given the FK -- a `plan` value with no
 * matching `platform.plans` row) rather than throwing: an entitlement decision should
 * degrade to "not entitled" for an unresolvable business, not blow up the caller.
 */
export async function getBusinessPlan(businessId: string): Promise<{ planId: string; planKey: string } | null> {
  const core = await coreClient();
  const { data: settings, error: settingsError } = await core
    .from("business_settings")
    .select("plan")
    .eq("business_id", businessId)
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings) return null;

  const platform = await platformClient();
  const { data: plan, error: planError } = await platform
    .from("plans")
    .select("id")
    .eq("key", settings.plan)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan) return null;

  return { planId: plan.id, planKey: settings.plan };
}
