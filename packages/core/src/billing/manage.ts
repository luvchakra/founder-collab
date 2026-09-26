import { createAdminClient } from "../db/admin";
import { SITE_URL } from "../site";
import { requireBillingManager } from "./access";
import { getPlan, listActivePlanPrices, type PlanPrice } from "./catalog";
import { auditBilling, logBilling } from "./observability";
import { publishBillingNotification } from "./notifications";
import { createProvider, loadProviderConfig } from "./provider-config";
import { reconcileSubscriptionLicenses } from "./provisioning";
import { syncSubscription } from "./sync";
import { BillingProviderError, type BillingInterval, type BillingProviderKey, type ChangeTiming, type SubscriptionStatus } from "./subscription-types";

/**
 * BILL-21..BILL-25 -- what a customer can do with the subscription they have: cancel at
 * period end (§8), undo that, change plan (§9, §10, §54) and open the provider's own
 * billing page for payment methods and invoices (§74). Owners and admins only.
 *
 * Every change goes to the provider first; WonderArk's record is then written from the
 * provider's *response* (its API, with WonderArk's credentials) and licences reconciled
 * from that -- never from the button click alone. The webhook that follows re-syncs the
 * same state, which the sync layer treats as a no-op.
 */

export class ManageBillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManageBillingError";
  }
}

type CurrentSubscription = {
  id: string;
  business_id: string;
  plan_id: string;
  provider: BillingProviderKey | "internal";
  environment: "test" | "live";
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  status: SubscriptionStatus;
  billing_interval: BillingInterval | null;
  currency: string | null;
  amount: number | string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

const platformAdmin = () => createAdminClient({ schema: "platform" });

async function currentSubscription(businessId: string): Promise<CurrentSubscription | null> {
  const { data, error } = await platformAdmin()
    .from("subscriptions")
    .select(
      "id, business_id, plan_id, provider, environment, provider_subscription_id, provider_customer_id, status, billing_interval, currency, amount, current_period_end, cancel_at_period_end",
    )
    .eq("business_id", businessId)
    .in("status", ["trialing", "active", "past_due", "paused", "cancel_scheduled", "unpaid"])
    .maybeSingle();
  if (error) throw error;
  return data as CurrentSubscription | null;
}

async function providerFor(sub: CurrentSubscription) {
  if (sub.provider === "internal" || !sub.provider_subscription_id) {
    throw new ManageBillingError("The free plan has nothing to manage at a payment provider.");
  }
  const config = await loadProviderConfig(sub.provider);
  if (!config?.secretKey || config.environment !== sub.environment) {
    throw new ManageBillingError("Billing is temporarily unavailable. Please try again later or contact support.");
  }
  return { provider: createProvider(config), key: sub.provider, environment: sub.environment, providerSubscriptionId: sub.provider_subscription_id };
}

function friendly(error: unknown, fallback: string): never {
  if (error instanceof ManageBillingError) throw error;
  if (error instanceof BillingProviderError && error.code === "unsupported") throw new ManageBillingError(error.message);
  throw new ManageBillingError(fallback);
}

/** §8 -- stop renewal; access continues to the end of the paid period. */
export async function cancelSubscriptionAtPeriodEnd(businessId: string, reason: string | null): Promise<void> {
  const manager = await requireBillingManager(businessId);
  const sub = await currentSubscription(businessId);
  if (!sub) throw new ManageBillingError("There's no active subscription to cancel.");
  if (sub.provider === "internal") throw new ManageBillingError("The free plan doesn't renew, so there's nothing to cancel.");
  if (sub.cancel_at_period_end) return;
  const p = await providerFor(sub);
  try {
    const updated = await p.provider.cancelSubscription(p.providerSubscriptionId, { atPeriodEnd: true });
    const synced = await syncSubscription(p.key, p.environment, updated);
    await reconcileSubscriptionLicenses(synced.id);
  } catch (error) {
    logBilling("billing.subscription", { business_id: businessId, subscription_id: sub.id, provider: sub.provider, operation: "cancel", status: "failed" });
    friendly(error, "We couldn't cancel your subscription. Please try again.");
  }
  await auditBilling(businessId, "billing.cancellation_requested", "subscription", sub.id, { reason: reason?.slice(0, 200) ?? null, at_period_end: true }, manager.userId);
  const plan = await getPlan(sub.plan_id);
  await publishBillingNotification(businessId, "billing.cancellation_scheduled", {
    plan: plan?.name ?? null,
    date: sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null,
  });
}

/** Undo a cancellation scheduled for period end, where the provider supports it. */
export async function resumeSubscription(businessId: string): Promise<void> {
  const manager = await requireBillingManager(businessId);
  const sub = await currentSubscription(businessId);
  if (!sub || !sub.cancel_at_period_end) throw new ManageBillingError("There's no scheduled cancellation to undo.");
  const p = await providerFor(sub);
  try {
    const updated = await p.provider.resumeSubscription(p.providerSubscriptionId);
    // Razorpay can't undo; Stripe clears the flag -- the response says which happened.
    if (p.key === "razorpay") {
      await platformAdmin().from("subscriptions").update({ cancel_at_period_end: false }).eq("id", sub.id);
    }
    const synced = await syncSubscription(p.key, p.environment, updated);
    await reconcileSubscriptionLicenses(synced.id);
  } catch (error) {
    friendly(error, "We couldn't resume your subscription. Please try again.");
  }
  await auditBilling(businessId, "billing.cancellation_undone", "subscription", sub.id, {}, manager.userId);
}

type BillingSettingsRow = { upgrade_timing: ChangeTiming; downgrade_timing: ChangeTiming; proration_enabled: boolean };

async function billingSettings(): Promise<BillingSettingsRow> {
  const { data, error } = await platformAdmin().from("billing_settings").select("upgrade_timing, downgrade_timing, proration_enabled").eq("id", true).maybeSingle();
  if (error) throw error;
  return (data as BillingSettingsRow | null) ?? { upgrade_timing: "immediate", downgrade_timing: "next_renewal", proration_enabled: true };
}

const monthly = (amount: number, interval: BillingInterval) => (interval === "year" ? amount / 12 : amount);

export type PlanChangePreview = {
  direction: "upgrade" | "downgrade";
  timing: ChangeTiming;
  prorate: boolean;
  targetPrice: PlanPrice;
  effectiveAt: string | null;
};

/** What a plan change would do, before the customer confirms it (§54). */
export async function previewPlanChange(businessId: string, planId: string, interval: BillingInterval): Promise<PlanChangePreview> {
  await requireBillingManager(businessId);
  const sub = await currentSubscription(businessId);
  if (!sub || sub.provider === "internal") throw new ManageBillingError("Choose a plan to subscribe first.");
  if (sub.plan_id === planId && sub.billing_interval === interval) throw new ManageBillingError("You're already on this plan.");
  if (sub.status !== "active" && sub.status !== "trialing") {
    throw new ManageBillingError("Resolve your subscription's payment or scheduled cancellation before changing plan.");
  }
  const plan = await getPlan(planId);
  if (!plan || plan.status !== "active") throw new ManageBillingError("That plan isn't available.");

  const prices = await listActivePlanPrices({ planId, environment: sub.environment });
  const targetPrice = prices.find((p) => p.provider === sub.provider && p.currency === sub.currency && p.billingInterval === interval);
  if (!targetPrice) throw new ManageBillingError("That plan isn't available for your current billing currency and provider.");

  const currentMonthly = monthly(Number(sub.amount ?? 0), sub.billing_interval ?? "month");
  const direction = monthly(targetPrice.amount, interval) >= currentMonthly ? "upgrade" : "downgrade";
  const settings = await billingSettings();
  const timing = direction === "upgrade" ? settings.upgrade_timing : settings.downgrade_timing;
  return {
    direction,
    timing,
    prorate: settings.proration_enabled && timing === "immediate",
    targetPrice,
    effectiveAt: timing === "immediate" ? null : sub.current_period_end,
  };
}

export async function changePlan(businessId: string, planId: string, interval: BillingInterval): Promise<PlanChangePreview> {
  const manager = await requireBillingManager(businessId);
  const preview = await previewPlanChange(businessId, planId, interval);
  const sub = (await currentSubscription(businessId))!;
  const p = await providerFor(sub);

  if (preview.timing === "next_renewal") {
    // Recorded before the provider call so the sync that follows keeps the current plan
    // until the period ends (sync.resolveSubscriptionPlan).
    const { error } = await platformAdmin()
      .from("subscriptions")
      .update({ pending_plan_id: planId, pending_change_at: sub.current_period_end })
      .eq("id", sub.id);
    if (error) throw error;
  }
  try {
    const updated = await p.provider.changeSubscription(p.providerSubscriptionId, {
      providerPriceId: preview.targetPrice.providerPriceId,
      timing: preview.timing,
      prorate: preview.prorate,
    });
    const synced = await syncSubscription(p.key, p.environment, updated);
    await reconcileSubscriptionLicenses(synced.id);
  } catch (error) {
    if (preview.timing === "next_renewal") {
      await platformAdmin().from("subscriptions").update({ pending_plan_id: null, pending_change_at: null }).eq("id", sub.id);
    }
    logBilling("billing.subscription", { business_id: businessId, subscription_id: sub.id, provider: sub.provider, operation: "change_plan", status: "failed" });
    friendly(error, "We couldn't change your plan. Please try again.");
  }
  await auditBilling(
    businessId,
    preview.timing === "immediate" ? "billing.plan_changed" : "billing.plan_change_scheduled",
    "subscription",
    sub.id,
    { from_plan_id: sub.plan_id, to_plan_id: planId, interval, direction: preview.direction, effective_at: preview.effectiveAt },
    manager.userId,
  );
  if (preview.timing === "next_renewal") {
    const target = await getPlan(planId);
    await publishBillingNotification(businessId, "billing.plan_change_scheduled", {
      plan: target?.name ?? null,
      date: preview.effectiveAt ? new Date(preview.effectiveAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null,
    });
  }
  return preview;
}

/** §74 -- the provider's own page for payment methods and invoices. */
export async function openBillingPortal(businessId: string, businessSlug: string): Promise<string> {
  await requireBillingManager(businessId);
  const sub = await currentSubscription(businessId);
  if (!sub || sub.provider === "internal" || !sub.provider_customer_id) {
    throw new ManageBillingError("There's no paid subscription with payment details to manage.");
  }
  const p = await providerFor(sub);
  try {
    const portal = await p.provider.createPortalSession({
      customerId: sub.provider_customer_id,
      subscriptionId: sub.provider_subscription_id,
      returnUrl: `${SITE_URL}/${encodeURIComponent(businessSlug)}/billing`,
    });
    if (!portal) throw new ManageBillingError("Your payment provider doesn't offer a billing page for this subscription.");
    return portal.url;
  } catch (error) {
    friendly(error, "We couldn't open billing management. Please try again.");
  }
}
