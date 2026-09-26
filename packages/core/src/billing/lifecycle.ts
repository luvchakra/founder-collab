import { createAdminClient } from "../db/admin";
import type { ModuleKey } from "../licensing/types";
import type { SubscriptionStatus } from "./subscription-types";
import { isEntitledStatus } from "./state";

/**
 * PLATFORM-P1-04.2/04.3/04.4 + PLATFORM-P1-05.1/05.3 -- the subscription lifecycle, currency
 * and subscription-tax settings stored on platform.billing_settings
 * (20260927202000_platform_subscription_lifecycle.sql), and the pure rules that apply them.
 * Read with the service role: checkout, webhooks, crons and licence provisioning all need
 * them, several with no signed-in user.
 */

export type SubscriptionTaxMode = "provider" | "inclusive" | "exclusive" | "none";

export type SubscriptionLifecycleSettings = {
  trialDays: number;
  trialPlanIds: string[];
  /** null = a trial gets the plan's full modules. */
  trialModuleKeys: ModuleKey[] | null;
  paymentGraceDays: number;
  featureGraceDays: number;
  /** null = kept indefinitely. Never a purge schedule (04.4). */
  lockedDataRetentionDays: number | null;
  supportedCurrencies: string[];
  taxMode: SubscriptionTaxMode;
  taxLabel: string | null;
  taxRatePercent: number | null;
  sellerTaxId: string | null;
  taxCountry: string | null;
};

/** ADR-9's 30-day read-only grace -- the floor feature_grace_days can never go below. */
export const MIN_FEATURE_GRACE_DAYS = 30;

export const DEFAULT_LIFECYCLE_SETTINGS: SubscriptionLifecycleSettings = {
  trialDays: 0,
  trialPlanIds: [],
  trialModuleKeys: null,
  paymentGraceDays: 7,
  featureGraceDays: MIN_FEATURE_GRACE_DAYS,
  lockedDataRetentionDays: null,
  supportedCurrencies: ["INR", "USD", "EUR", "GBP"],
  taxMode: "provider",
  taxLabel: null,
  taxRatePercent: null,
  sellerTaxId: null,
  taxCountry: null,
};

export const LIFECYCLE_COLUMNS =
  "trial_days, trial_plan_ids, trial_module_keys, payment_grace_days, feature_grace_days, locked_data_retention_days, supported_currencies, tax_mode, tax_label, tax_rate_percent, seller_tax_id, tax_country";

export function toLifecycleSettings(row: Record<string, unknown> | null | undefined): SubscriptionLifecycleSettings {
  if (!row) return DEFAULT_LIFECYCLE_SETTINGS;
  const d = DEFAULT_LIFECYCLE_SETTINGS;
  return {
    trialDays: (row.trial_days as number | undefined) ?? d.trialDays,
    trialPlanIds: (row.trial_plan_ids as string[] | undefined) ?? d.trialPlanIds,
    trialModuleKeys: (row.trial_module_keys as ModuleKey[] | null | undefined) ?? null,
    paymentGraceDays: (row.payment_grace_days as number | undefined) ?? d.paymentGraceDays,
    featureGraceDays: Math.max((row.feature_grace_days as number | undefined) ?? d.featureGraceDays, MIN_FEATURE_GRACE_DAYS),
    lockedDataRetentionDays: (row.locked_data_retention_days as number | null | undefined) ?? null,
    supportedCurrencies: (row.supported_currencies as string[] | undefined) ?? d.supportedCurrencies,
    taxMode: (row.tax_mode as SubscriptionTaxMode | undefined) ?? d.taxMode,
    taxLabel: (row.tax_label as string | null | undefined) ?? null,
    taxRatePercent: row.tax_rate_percent == null ? null : Number(row.tax_rate_percent),
    sellerTaxId: (row.seller_tax_id as string | null | undefined) ?? null,
    taxCountry: (row.tax_country as string | null | undefined) ?? null,
  };
}

/** The platform's lifecycle settings; the defaults when the row can't be read, so a
 * billing path never fails closed on configuration alone. */
export async function loadLifecycleSettings(): Promise<SubscriptionLifecycleSettings> {
  const { data, error } = await createAdminClient({ schema: "platform" }).from("billing_settings").select(LIFECYCLE_COLUMNS).eq("id", true).maybeSingle();
  if (error) throw error;
  return toLifecycleSettings(data as Record<string, unknown> | null);
}

/** PLATFORM-P1-04.3 feature grace: the read-only window a deactivated licence gets. Falls
 * back to ADR-9's 30 days if the setting can't be read. */
export async function loadFeatureGraceDays(): Promise<number> {
  try {
    return (await loadLifecycleSettings()).featureGraceDays;
  } catch {
    return MIN_FEATURE_GRACE_DAYS;
  }
}

/**
 * PLATFORM-P1-04.2 -- pure: may this business start a trial of this plan? Trials are on
 * (trialDays > 0), the plan is one of the eligible ones, and the business has never had a
 * trial before -- one trial per business, ever, so cancelling and re-choosing can't chain
 * free periods.
 */
export function isTrialEligible(settings: SubscriptionLifecycleSettings, planId: string, businessHadTrial: boolean): boolean {
  return settings.trialDays > 0 && settings.trialPlanIds.includes(planId) && !businessHadTrial;
}

/** PLATFORM-P1-04.2 trial entitlements -- pure: what a trialing subscription licenses. */
export function trialEntitlements(planModules: ModuleKey[], settings: SubscriptionLifecycleSettings): ModuleKey[] {
  if (!settings.trialModuleKeys) return planModules;
  const allowed = new Set(settings.trialModuleKeys);
  return planModules.filter((m) => allowed.has(m));
}

/**
 * PLATFORM-P1-04.3 payment grace -- pure: does a subscription keep its modules right now?
 * `isEntitledStatus()` (BILL-15) plus one rule: a past_due subscription keeps them only
 * for `paymentGraceDays` after the payment first failed. After that its licences start the
 * read-only feature grace like any other ended subscription -- never deletion (04.4).
 */
export function isEntitledNow(
  status: SubscriptionStatus,
  pastDueSince: string | null,
  settings: Pick<SubscriptionLifecycleSettings, "paymentGraceDays">,
  now: Date = new Date(),
): boolean {
  if (!isEntitledStatus(status)) return false;
  if (status !== "past_due" || !pastDueSince) return true;
  return now.getTime() - new Date(pastDueSince).getTime() < settings.paymentGraceDays * 24 * 60 * 60 * 1000;
}

/** PLATFORM-P1-05.1 -- pure: does WonderArk bill in this currency at all? */
export function isSupportedCurrency(settings: Pick<SubscriptionLifecycleSettings, "supportedCurrencies">, currency: string): boolean {
  return settings.supportedCurrencies.includes(currency.toUpperCase());
}

export type SubscriptionTaxLine = { label: string; detail: string; taxAmount: number | null; total: number | null };

/**
 * PLATFORM-P1-05.3 -- pure: the tax line the plan review page shows for WonderArk's own
 * subscription tax. Never derived from the customer's own compliance/GST configuration.
 * `provider` mode says only what is true -- the payment page calculates it -- rather than
 * inventing a figure (subscription billing §56).
 */
export function describeSubscriptionTax(
  settings: Pick<SubscriptionLifecycleSettings, "taxMode" | "taxLabel" | "taxRatePercent">,
  amount: number,
): SubscriptionTaxLine {
  const label = settings.taxLabel ?? "Tax";
  const rate = settings.taxRatePercent ?? 0;
  switch (settings.taxMode) {
    case "none":
      return { label: "Taxes", detail: "No tax is charged on this plan", taxAmount: 0, total: amount };
    case "inclusive": {
      const tax = Math.round((amount - amount / (1 + rate / 100)) * 100) / 100;
      return { label, detail: `Included in the price (${rate}%)`, taxAmount: tax, total: amount };
    }
    case "exclusive": {
      const tax = Math.round(amount * rate) / 100;
      return { label, detail: `${rate}% added to the price`, taxAmount: tax, total: Math.round((amount + tax) * 100) / 100 };
    }
    default:
      return { label: "Taxes", detail: "Shown on the payment page, if applicable", taxAmount: null, total: null };
  }
}

/** Whether a business has ever had a trial (PLATFORM-P1-04.2's one-per-business rule). */
export async function businessHadTrial(businessId: string): Promise<boolean> {
  const { count, error } = await createAdminClient({ schema: "platform" })
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .not("trial_start", "is", null);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** The trial a business would get by choosing this plan now, or null. */
export async function getTrialOffer(businessId: string, planId: string): Promise<{ days: number } | null> {
  const settings = await loadLifecycleSettings();
  if (!isTrialEligible(settings, planId, false)) return null;
  if (await businessHadTrial(businessId)) return null;
  return { days: settings.trialDays };
}
