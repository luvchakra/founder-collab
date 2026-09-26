import { z } from "zod";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { LIFECYCLE_COLUMNS, MIN_FEATURE_GRACE_DAYS, toLifecycleSettings, type SubscriptionLifecycleSettings } from "../billing/lifecycle";

/**
 * PLATFORM-P1-04.2/04.3/04.4 + PLATFORM-P1-05.1/05.3 -- the superadmin side of the
 * subscription lifecycle, currency and subscription-tax settings. Two reason-required
 * SECURITY DEFINER functions write platform.billing_settings and its existing
 * billing_settings_events history, so these changes show up in Configuration History and
 * Audit Search next to BILL-29's plan-change rules. PLATFORM-P1-05.2 (provider and
 * environment) is BILL-06's Providers page; PLATFORM-P1-05.4 (price versioning) is enforced
 * by the database (immutable plan_prices rows, subscriptions.plan_price_id).
 */

type Result = { ok: true } | { ok: false; error: string };

export async function getSubscriptionLifecycleSettings(): Promise<SubscriptionLifecycleSettings> {
  await requireSuperadmin();
  const platform = await createClient({ schema: "platform" });
  const { data, error } = await platform.from("billing_settings").select(LIFECYCLE_COLUMNS).eq("id", true).maybeSingle();
  if (error) throw error;
  return toLifecycleSettings(data as Record<string, unknown> | null);
}

const reason = z.string().trim().min(1, "A reason is required.").max(500);

export const updateLifecycleSchema = z.object({
  trialDays: z.coerce.number().int().min(0).max(90),
  trialPlanIds: z.array(z.string().uuid()),
  /** null = the trial gets the plan's full modules. */
  trialModuleKeys: z.array(z.string().regex(/^[a-z_]+$/)).nullable(),
  paymentGraceDays: z.coerce.number().int().min(0).max(60),
  featureGraceDays: z.coerce.number().int().min(MIN_FEATURE_GRACE_DAYS, `The read-only grace can't be shorter than ${MIN_FEATURE_GRACE_DAYS} days.`).max(365),
  lockedDataRetentionDays: z.coerce.number().int().min(365, "Retention after lock is at least 365 days, or leave blank to keep data indefinitely.").nullable(),
  reason,
});
export type UpdateLifecycleInput = z.input<typeof updateLifecycleSchema>;

export async function updateSubscriptionLifecycle(input: UpdateLifecycleInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = updateLifecycleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  const d = parsed.data;
  const platform = await createClient({ schema: "platform" });
  const { error } = await platform.rpc("update_subscription_lifecycle", {
    p_trial_days: d.trialDays,
    p_trial_plan_ids: d.trialPlanIds,
    p_trial_module_keys: d.trialModuleKeys,
    p_payment_grace_days: d.paymentGraceDays,
    p_feature_grace_days: d.featureGraceDays,
    p_locked_data_retention_days: d.lockedDataRetentionDays,
    p_reason: d.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export const updateBillingConfigSchema = z
  .object({
    supportedCurrencies: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use 3-letter currency codes.")).min(1, "Keep at least one currency."),
    taxMode: z.enum(["provider", "inclusive", "exclusive", "none"]),
    taxLabel: z.string().trim().max(40).nullable(),
    taxRatePercent: z.coerce.number().min(0).max(100).nullable(),
    sellerTaxId: z.string().trim().max(40).nullable(),
    taxCountry: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^([A-Z]{2})?$/, "Use a 2-letter country code.")
      .nullable(),
    reason,
  })
  .superRefine((v, ctx) => {
    if ((v.taxMode === "inclusive" || v.taxMode === "exclusive") && (v.taxRatePercent === null || !v.taxLabel)) {
      ctx.addIssue({ code: "custom", path: ["taxRatePercent"], message: "A fixed tax needs a label and a rate." });
    }
  });
export type UpdateBillingConfigInput = z.input<typeof updateBillingConfigSchema>;

export async function updateSubscriptionBillingConfig(input: UpdateBillingConfigInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = updateBillingConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  const d = parsed.data;
  const platform = await createClient({ schema: "platform" });
  const { error } = await platform.rpc("update_subscription_billing_config", {
    p_supported_currencies: d.supportedCurrencies,
    p_tax_mode: d.taxMode,
    p_tax_label: d.taxLabel,
    p_tax_rate_percent: d.taxRatePercent,
    p_seller_tax_id: d.sellerTaxId,
    p_tax_country: d.taxCountry || null,
    p_reason: d.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
