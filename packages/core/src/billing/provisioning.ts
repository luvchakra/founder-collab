import { createAdminClient } from "../db/admin";
import { activateLicense, deactivateLicense } from "../licensing/lifecycle";
import type { LicenseStatus, ModuleKey } from "../licensing/types";
import { getPlan, resolvePlanEntitlements } from "./catalog";
import { auditBilling, logBilling } from "./observability";
import { isEntitledStatus } from "./state";
import type { SubscriptionStatus } from "./subscription-types";

/**
 * BILL-17 / BILL-18 -- turns a WonderArk subscription into module licences (§5, §6, §47,
 * §48). core.licenses stays the only authorization mechanism and the existing lifecycle
 * functions are the only writers: activateLicense() creates or restores (and replays
 * parked events), deactivateLicense() starts the 30-day read-only grace (ADR-9). Nothing
 * here deletes a licence or its data.
 *
 * Idempotent by construction: it compares the licences a business has with the licences
 * its subscription should give it and only acts on the difference, so a webhook delivered
 * five times provisions once.
 *
 * Ownership (§49): a licence the subscription provides carries source='subscription' and
 * the subscription's id. A licence granted by hand (source='manual', every licence that
 * existed before billing) is adopted when the plan includes its module, and otherwise left
 * exactly as it is -- billing never revokes access it didn't grant (§13).
 */

type LicenseRow = {
  id: string;
  module_key: ModuleKey;
  status: LicenseStatus;
  cancel_at: string | null;
  source: "manual" | "subscription";
  subscription_id: string | null;
};

type SubscriptionRow = {
  id: string;
  business_id: string;
  plan_id: string;
  status: SubscriptionStatus;
};

export type ReconcileResult = {
  subscriptionId: string;
  businessId: string;
  entitled: boolean;
  planKey: string | null;
  activated: ModuleKey[];
  adopted: ModuleKey[];
  deactivated: ModuleKey[];
  planSetting: string | null;
};

/** Pure: what to do to a business's licences for one subscription. Exported for tests. */
export function planLicenseChanges(
  subscription: { id: string; entitled: boolean },
  entitlements: ModuleKey[],
  licenses: LicenseRow[],
): { activate: ModuleKey[]; adopt: ModuleKey[]; deactivate: ModuleKey[] } {
  const wanted = new Set(subscription.entitled ? entitlements : []);
  const byModule = new Map(licenses.map((l) => [l.module_key, l]));
  const activate: ModuleKey[] = [];
  const adopt: ModuleKey[] = [];
  for (const moduleKey of wanted) {
    const license = byModule.get(moduleKey);
    // A scheduled manual cancellation is undone too: the plan now pays for this module.
    if (!license || license.status !== "active" || license.cancel_at) activate.push(moduleKey);
    if (!license || license.source !== "subscription" || license.subscription_id !== subscription.id) adopt.push(moduleKey);
  }
  // Only licences this subscription provided are ever taken away, and only into grace.
  const deactivate = licenses
    .filter((l) => l.source === "subscription" && l.subscription_id === subscription.id && l.status === "active" && !wanted.has(l.module_key))
    .map((l) => l.module_key);
  return { activate: activate.sort(), adopt: adopt.sort(), deactivate: deactivate.sort() };
}

/** BILL-18 `reconcilePlanLicenses()` -- brings a business's licences and its
 * business_settings.plan in line with one subscription. */
export async function reconcileSubscriptionLicenses(subscriptionId: string): Promise<ReconcileResult> {
  const started = Date.now();
  const platform = createAdminClient({ schema: "platform" });
  const core = createAdminClient({ schema: "core" });

  const { data: sub, error: subError } = await platform
    .from("subscriptions")
    .select("id, business_id, plan_id, status")
    .eq("id", subscriptionId)
    .single();
  if (subError) throw subError;
  const subscription = sub as SubscriptionRow;
  const entitled = isEntitledStatus(subscription.status);

  const [entitlements, plan, { data: licenseRows, error: licenseError }] = await Promise.all([
    resolvePlanEntitlements(subscription.plan_id),
    getPlan(subscription.plan_id),
    core.from("licenses").select("id, module_key, status, cancel_at, source, subscription_id").eq("business_id", subscription.business_id),
  ]);
  if (licenseError) throw licenseError;

  const changes = planLicenseChanges({ id: subscription.id, entitled }, entitlements, (licenseRows ?? []) as LicenseRow[]);

  for (const moduleKey of changes.activate) await activateLicense(subscription.business_id, moduleKey);
  if (changes.adopt.length > 0) {
    const { error } = await core
      .from("licenses")
      .update({ source: "subscription", subscription_id: subscription.id })
      .eq("business_id", subscription.business_id)
      .in("module_key", changes.adopt);
    if (error) throw error;
  }
  for (const moduleKey of changes.deactivate) await deactivateLicense(subscription.business_id, moduleKey);

  const planSetting = await syncBusinessPlanSetting(subscription.business_id, entitled ? (plan?.key ?? null) : null, subscription.id);

  const result: ReconcileResult = {
    subscriptionId: subscription.id,
    businessId: subscription.business_id,
    entitled,
    planKey: plan?.key ?? null,
    activated: changes.activate,
    adopted: changes.adopt,
    deactivated: changes.deactivate,
    planSetting,
  };
  const changed = changes.activate.length + changes.adopt.length + changes.deactivate.length > 0 || planSetting !== null;
  if (changed) {
    await auditBilling(subscription.business_id, "billing.license_reconciled", "subscription", subscription.id, {
      plan: plan?.key ?? null,
      status: subscription.status,
      activated: changes.activate,
      adopted: changes.adopt,
      deactivated: changes.deactivate,
      plan_setting: planSetting,
    });
  }
  logBilling("billing.license_reconciliation", {
    business_id: subscription.business_id,
    subscription_id: subscription.id,
    status: changed ? "changed" : "unchanged",
    duration_ms: Date.now() - started,
  });
  return result;
}

/**
 * core.business_settings.plan drives feature flags and usage limits. It follows the
 * business's entitled subscription; when none is left it falls back to the free plan.
 * Returns the new value when it changed, null when it didn't. Written with the service
 * role -- the 20260926120000 trigger refuses a plan change from any signed-in user.
 */
async function syncBusinessPlanSetting(businessId: string, entitledPlanKey: string | null, subscriptionId: string): Promise<string | null> {
  const platform = createAdminClient({ schema: "platform" });
  const core = createAdminClient({ schema: "core" });

  let target = entitledPlanKey;
  if (!target) {
    // This subscription no longer entitles anything -- but another may (an upgrade that
    // replaced it). Only fall back to free when no entitled subscription remains.
    const { data: others, error } = await platform
      .from("subscriptions")
      .select("id, plan_id, status")
      .eq("business_id", businessId)
      .neq("id", subscriptionId)
      .in("status", ["active", "trialing", "past_due", "cancel_scheduled"])
      .limit(1);
    if (error) throw error;
    if (others && others.length > 0) return null;
    const free = await freePlanKey();
    if (!free) return null;
    target = free;
  }

  const { data: settings, error: readError } = await core.from("business_settings").select("plan").eq("business_id", businessId).maybeSingle();
  if (readError) throw readError;
  if (!settings || settings.plan === target) return null;
  const { error } = await core.from("business_settings").update({ plan: target }).eq("business_id", businessId);
  if (error) throw error;
  return target;
}

async function freePlanKey(): Promise<string | null> {
  const platform = createAdminClient({ schema: "platform" });
  const { data, error } = await platform.from("plans").select("key").eq("price", 0).eq("status", "active").order("display_order").limit(1);
  if (error) throw error;
  return (data?.[0]?.key as string | undefined) ?? null;
}
