import { createAdminClient } from "../db/admin";
import type { ModuleKey } from "../licensing/types";
import { requireBillingManager } from "./access";
import { getPlanByKey, listActivePlanPrices, resolvePlanEntitlements } from "./catalog";
import { isCheckoutReady, loadProviderConfigs } from "./provider-config";

/**
 * BILL-17 -- the Licenses settings page's own activate/cancel buttons, reconciled with
 * paid plans (§5: "the customer does not separately buy each module").
 *
 * Before billing, any member of a business could switch any module on for free from
 * /dashboard/settings/licenses. Now:
 *
 * - only account owners and admins can change licences at all (the same people who
 *   manage billing);
 * - once online checkout is live (a provider ready and at least one plan priced for it),
 *   a module can only be switched on here if the business's current plan includes it --
 *   otherwise the answer is "choose a plan that includes it";
 * - a licence the subscription provides can't be cancelled here -- the plan is changed or
 *   cancelled on the Billing page instead, so the two never disagree.
 *
 * Until checkout is live nothing changes for owners and admins, so a deployment without
 * provider keys keeps working as before.
 */

export class LicenseChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LicenseChangeError";
  }
}

export async function isSubscriptionCheckoutLive(): Promise<boolean> {
  const configs = (await loadProviderConfigs()).filter(isCheckoutReady);
  if (configs.length === 0) return false;
  const prices = await listActivePlanPrices();
  return prices.some((p) => configs.some((c) => c.provider === p.provider && c.environment === p.environment));
}

export async function assertModuleActivationAllowed(businessId: string, moduleKey: ModuleKey): Promise<void> {
  await requireBillingManager(businessId);
  if (!(await isSubscriptionCheckoutLive())) return;

  const core = createAdminClient({ schema: "core" });
  const { data, error } = await core.from("business_settings").select("plan").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  const plan = data?.plan ? await getPlanByKey(data.plan as string) : null;
  const included = plan ? await resolvePlanEntitlements(plan.id) : [];
  if (!included.includes(moduleKey)) {
    throw new LicenseChangeError("Your current plan doesn't include this module. Choose a plan that includes it on the Billing page.");
  }
}

export async function assertModuleCancellationAllowed(businessId: string, moduleKey: ModuleKey): Promise<void> {
  await requireBillingManager(businessId);
  const core = createAdminClient({ schema: "core" });
  const { data, error } = await core
    .from("licenses")
    .select("source")
    .eq("business_id", businessId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (error) throw error;
  if (data?.source === "subscription") {
    throw new LicenseChangeError("This module comes with your plan. Change or cancel your plan on the Billing page.");
  }
}
