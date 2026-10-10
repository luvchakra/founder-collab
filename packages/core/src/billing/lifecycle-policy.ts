import { createAdminClient } from "../db/admin";
import { isEntitledStatus } from "./state";
import type { SubscriptionStatus } from "./subscription-types";

/**
 * PLATFORM-P1-04.2 (Trial Configuration), PLATFORM-P1-04.3 (Grace Period) and
 * PLATFORM-P1-04.4 (Cancellation Behavior): the subscription lifecycle settings stored on
 * platform.billing_settings (migration 20261010130000), read by checkout (trials),
 * provisioning (trial entitlements, payment grace) and licensing (the read-only period).
 *
 * The lifecycle stays cancel -> paid period ends -> read-only grace -> locked, and data is
 * never deleted because a subscription ended (ADR-9) -- these settings only change how long
 * each step lasts.
 */

export type LifecyclePolicy = {
  trialDays: number;
  trialPlanKeys: string[];
  trialEntitlements: "plan" | "all_modules";
  /** null: a past-due subscription keeps its modules until the provider stops retrying. */
  paymentGraceDays: number | null;
  /** Read-only days after a licence's subscription ends, before it locks. At least 30. */
  featureGraceDays: number;
};

/** What the platform did before these settings existed -- also the migration's defaults. */
export const DEFAULT_LIFECYCLE_POLICY: LifecyclePolicy = {
  trialDays: 0,
  trialPlanKeys: [],
  trialEntitlements: "plan",
  paymentGraceDays: null,
  featureGraceDays: 30,
};

/** Service-role read: checkout, provisioning and the cron sweeps run without a superadmin
 * session. A failed read throws rather than guessing a policy. */
export async function getLifecyclePolicy(): Promise<LifecyclePolicy> {
  const { data, error } = await createAdminClient({ schema: "platform" })
    .from("billing_settings")
    .select("trial_days, trial_plan_keys, trial_entitlements, payment_grace_days, feature_grace_days")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_LIFECYCLE_POLICY;
  return {
    trialDays: data.trial_days as number,
    trialPlanKeys: (data.trial_plan_keys as string[] | null) ?? [],
    trialEntitlements: data.trial_entitlements as LifecyclePolicy["trialEntitlements"],
    paymentGraceDays: (data.payment_grace_days as number | null) ?? null,
    featureGraceDays: data.feature_grace_days as number,
  };
}

/** Trial days a new checkout for this plan gets: none unless trials are on, the plan is
 * eligible, and the business has never had a paid subscription (one trial per business). */
export function trialDaysFor(policy: LifecyclePolicy, planKey: string, hadPaidSubscription: boolean): number {
  if (policy.trialDays <= 0 || hadPaidSubscription) return 0;
  return policy.trialPlanKeys.includes(planKey) ? policy.trialDays : 0;
}

/** Whether a subscription keeps its modules right now: the status rule from state.ts,
 * narrowed by payment grace -- past_due keeps them only for `paymentGraceDays` once set. */
export function isSubscriptionEntitled(
  status: SubscriptionStatus,
  pastDueSince: string | null,
  policy: LifecyclePolicy,
  now: number = Date.now(),
): boolean {
  if (!isEntitledStatus(status)) return false;
  if (status !== "past_due" || policy.paymentGraceDays === null || !pastDueSince) return true;
  return now - Date.parse(pastDueSince) < policy.paymentGraceDays * 24 * 60 * 60 * 1000;
}
