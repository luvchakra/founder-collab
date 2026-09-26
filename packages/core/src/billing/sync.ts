import { createAdminClient } from "../db/admin";
import { findPlanPriceByProviderId } from "./catalog";
import { auditBilling, logBilling } from "./observability";
import { publishBillingNotification } from "./notifications";
import { getPlan } from "./catalog";
import { isEntitledStatus, isLiveStatus, mapRazorpayStatus } from "./state";
import type {
  BillingEnvironment,
  BillingProviderKey,
  PaymentStatus,
  ProviderPayment,
  ProviderSubscription,
  SubscriptionStatus,
} from "./subscription-types";

/**
 * BILL-15 / BILL-16 -- provider state written into WonderArk's own subscription and payment
 * records (§19, §20, §59). Everything arriving here has come from a verified webhook or
 * from the provider's API with WonderArk's own credentials; nothing from a browser.
 *
 * Which plan a subscription is on comes from the provider *price* it bills
 * (platform.plan_prices), not from metadata the checkout attached -- metadata only ties a
 * new provider subscription to the WonderArk checkout session and business that created
 * it, and even that is cross-checked against the stored session.
 */

export class UnknownBillingReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownBillingReferenceError";
  }
}

type SubscriptionRow = {
  id: string;
  business_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  cancel_at_period_end: boolean;
  pending_plan_id: string | null;
  pending_change_at: string | null;
  provider_subscription_id: string | null;
};

type CheckoutSessionRow = {
  id: string;
  business_id: string;
  plan_id: string;
  provider: string;
  environment: string;
  status: string;
};

export type SyncedSubscription = {
  id: string;
  businessId: string;
  status: SubscriptionStatus;
  previousStatus: SubscriptionStatus | null;
  planId: string;
  previousPlanId: string | null;
  /** Internal (free-plan) subscriptions this one replaced -- their licences need
   * reconciling too, after this one's, so nothing they granted is left orphaned. */
  replacedSubscriptionIds: string[];
};

const platformAdmin = () => createAdminClient({ schema: "platform" });

/**
 * Which plan the subscription is on after this update. A change scheduled for the next
 * renewal (§10) keeps the current plan until `pending_change_at`, even though Stripe
 * already bills the new price from the next invoice; once that moment passes, or once the
 * provider reports the pending plan's price, the pending plan takes over.
 */
export function resolveSubscriptionPlan(
  existing: Pick<SubscriptionRow, "plan_id" | "pending_plan_id" | "pending_change_at"> | null,
  billedPlanId: string | null,
  now: Date = new Date(),
): { planId: string | null; clearPending: boolean } {
  if (!existing) return { planId: billedPlanId, clearPending: false };
  if (existing.pending_plan_id) {
    const due = existing.pending_change_at ? new Date(existing.pending_change_at) <= now : false;
    if (due) return { planId: existing.pending_plan_id, clearPending: true };
    if (billedPlanId === existing.pending_plan_id) return { planId: existing.plan_id, clearPending: false };
  }
  return { planId: billedPlanId ?? existing.plan_id, clearPending: false };
}

export async function syncSubscription(
  provider: BillingProviderKey,
  environment: BillingEnvironment,
  incoming: ProviderSubscription,
  hint: { checkoutSessionId?: string | null } = {},
): Promise<SyncedSubscription> {
  const platform = platformAdmin();
  const { data: existingData, error: existingError } = await platform
    .from("subscriptions")
    .select("id, business_id, plan_id, status, cancel_at_period_end, pending_plan_id, pending_change_at, provider_subscription_id")
    .eq("provider", provider)
    .eq("environment", environment)
    .eq("provider_subscription_id", incoming.id)
    .maybeSingle();
  if (existingError) throw existingError;
  const existing = existingData as SubscriptionRow | null;

  // Razorpay's subscription entity has no cancel-at-period-end flag; WonderArk remembers
  // that it asked for one (cancelSubscription) and keeps it while Razorpay says active.
  let cancelAtPeriodEnd = incoming.cancelAtPeriodEnd;
  let status = incoming.status;
  if (provider === "razorpay" && existing?.cancel_at_period_end && incoming.providerStatus === "active") {
    cancelAtPeriodEnd = true;
    status = mapRazorpayStatus(incoming.providerStatus, true);
  }

  const billedPrice = incoming.providerPriceId ? await findPlanPriceByProviderId(provider, environment, incoming.providerPriceId) : null;

  let businessId = existing?.business_id ?? null;
  let session: CheckoutSessionRow | null = null;
  const sessionId = incoming.metadata.checkout_session_id ?? hint.checkoutSessionId ?? null;
  if (sessionId) {
    const { data, error } = await platform
      .from("checkout_sessions")
      .select("id, business_id, plan_id, provider, environment, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (error && error.code !== "22P02") throw error;
    session = (data as CheckoutSessionRow | null) ?? null;
    // The session must be one WonderArk created for this provider and environment, and
    // for the business the metadata names -- otherwise it is someone else's reference.
    if (session && (session.provider !== provider || session.environment !== environment)) session = null;
    if (session && incoming.metadata.business_id && incoming.metadata.business_id !== session.business_id) session = null;
  }
  if (!businessId) businessId = session?.business_id ?? null;
  if (!businessId) throw new UnknownBillingReferenceError("Subscription is not linked to a WonderArk checkout.");

  const { planId: resolvedPlanId, clearPending } = resolveSubscriptionPlan(existing, billedPrice?.planId ?? session?.plan_id ?? null);
  if (!resolvedPlanId) throw new UnknownBillingReferenceError("Subscription bills a price that isn't mapped to a plan.");

  // A paid subscription replacing the free plan: the internal free subscription steps
  // aside first, so the one-live-subscription-per-business index holds (§50).
  let replacedSubscriptionIds: string[] = [];
  if (isLiveStatus(status)) {
    const { data, error } = await platform
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("business_id", businessId)
      .eq("provider", "internal")
      .in("status", ["active", "trialing"])
      .select("id");
    if (error) throw error;
    replacedSubscriptionIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
  }

  const fields = {
    plan_id: resolvedPlanId,
    provider_customer_id: incoming.customerId,
    status,
    provider_status: incoming.providerStatus,
    billing_interval: billedPrice?.billingInterval ?? null,
    currency: billedPrice?.currency ?? null,
    amount: billedPrice?.amount ?? null,
    current_period_start: incoming.currentPeriodStart,
    current_period_end: incoming.currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancelled_at: incoming.cancelledAt,
    trial_start: incoming.trialStart,
    trial_end: incoming.trialEnd,
    provider_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(clearPending ? { pending_plan_id: null, pending_change_at: null } : {}),
    // PLATFORM-P1-05.4: the exact (immutable) price row this subscription bills.
    plan_price_id: billedPrice?.id ?? null,
    // PLATFORM-P1-04.3: when the payment first failed -- the payment grace counts from here.
    ...pastDueSinceField(existing?.status ?? null, status),
  };
  // A price we can't map (the admin removed the row) leaves the stored money fields alone.
  if (!billedPrice) {
    delete (fields as Partial<typeof fields>).billing_interval;
    delete (fields as Partial<typeof fields>).currency;
    delete (fields as Partial<typeof fields>).amount;
    delete (fields as Partial<typeof fields>).plan_price_id;
  }

  let id: string;
  if (existing) {
    const { error } = await platform.from("subscriptions").update(fields).eq("id", existing.id);
    if (error) throw error;
    id = existing.id;
  } else {
    const { data, error } = await platform
      .from("subscriptions")
      .insert({
        ...fields,
        business_id: businessId,
        provider,
        environment,
        provider_subscription_id: incoming.id,
        provider_created_at: new Date().toISOString(),
        metadata: { checkout_session_id: session?.id ?? null },
      })
      .select("id")
      .single();
    if (error) {
      // Two deliveries creating the same subscription at once: the loser re-runs as an update.
      if (error.code === "23505") return syncSubscription(provider, environment, incoming, hint);
      throw error;
    }
    id = data.id as string;
  }

  if (session && session.status === "open" && isEntitledStatus(status)) {
    const { error } = await platform
      .from("checkout_sessions")
      .update({ status: "completed", subscription_id: id, provider_subscription_id: incoming.id, completed_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("status", "open");
    if (error) throw error;
    await auditBilling(businessId, "billing.checkout_completed", "checkout_session", session.id, { provider, subscription_id: id });
  }

  const previousStatus = existing?.status ?? null;
  const previousPlanId = existing?.plan_id ?? null;
  if (!existing) {
    await auditBilling(businessId, "billing.subscription_created", "subscription", id, { provider, environment, status, plan_id: resolvedPlanId });
  } else if (previousStatus !== status) {
    const cancelled = status === "cancelled" || status === "expired";
    await auditBilling(businessId, cancelled ? "billing.subscription_cancelled" : "billing.subscription_updated", "subscription", id, {
      provider,
      from: previousStatus,
      to: status,
    });
  }
  if (existing && previousPlanId !== resolvedPlanId) {
    await auditBilling(businessId, "billing.plan_changed", "subscription", id, { from_plan_id: previousPlanId, to_plan_id: resolvedPlanId });
  }
  logBilling("billing.subscription", { business_id: businessId, subscription_id: id, provider, operation: "sync", status });

  // BILL-34/35: tell the customer about the moments that matter, once each.
  const becameEntitled = isEntitledStatus(status) && (!previousStatus || !isEntitledStatus(previousStatus));
  const ended = (status === "cancelled" || status === "expired") && previousStatus !== null && previousStatus !== "cancelled" && previousStatus !== "expired";
  const planChanged = Boolean(existing) && previousPlanId !== resolvedPlanId && isEntitledStatus(status);
  if (becameEntitled || ended || planChanged) {
    const plan = (await getPlan(resolvedPlanId))?.name ?? null;
    if (becameEntitled) await publishBillingNotification(businessId, "billing.subscription_activated", { plan });
    else if (ended) await publishBillingNotification(businessId, "billing.subscription_cancelled", { plan });
    else await publishBillingNotification(businessId, "billing.plan_changed", { plan });
  }

  return { id, businessId, status, previousStatus, planId: resolvedPlanId, previousPlanId, replacedSubscriptionIds };
}

/** Later payment facts never walk an earlier one back: a late "failed" for a payment
 * already captured, or a "succeeded" arriving after its refund, keeps the later state. */
const PAYMENT_RANK: Record<PaymentStatus, number> = {
  pending: 0,
  failed: 1,
  succeeded: 2,
  partially_refunded: 3,
  refunded: 4,
  disputed: 5,
  chargeback: 6,
};

export function mergePaymentStatus(current: PaymentStatus | null, incoming: PaymentStatus): PaymentStatus {
  if (!current) return incoming;
  return PAYMENT_RANK[incoming] >= PAYMENT_RANK[current] ? incoming : current;
}

type PaymentRow = {
  id: string;
  business_id: string;
  subscription_id: string | null;
  status: PaymentStatus;
  refunded_amount: number | string;
};

export type SyncedPayment = { id: string; businessId: string; status: PaymentStatus; previousStatus: PaymentStatus | null };

export async function syncPayment(
  provider: BillingProviderKey,
  environment: BillingEnvironment,
  incoming: ProviderPayment,
): Promise<SyncedPayment | null> {
  const platform = platformAdmin();

  let existing: PaymentRow | null = null;
  const columns = "id, business_id, subscription_id, status, refunded_amount";
  if (incoming.id) {
    const { data, error } = await platform
      .from("billing_payments")
      .select(columns)
      .eq("provider", provider)
      .eq("environment", environment)
      .eq("provider_payment_id", incoming.id)
      .maybeSingle();
    if (error) throw error;
    existing = data as PaymentRow | null;
  }
  if (!existing && incoming.invoiceId) {
    const { data, error } = await platform
      .from("billing_payments")
      .select(columns)
      .eq("provider", provider)
      .eq("environment", environment)
      .eq("provider_invoice_id", incoming.invoiceId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    existing = ((data ?? [])[0] as PaymentRow | undefined) ?? null;
  }

  let subscriptionId = existing?.subscription_id ?? null;
  let businessId = existing?.business_id ?? null;
  if (incoming.subscriptionId) {
    const { data, error } = await platform
      .from("subscriptions")
      .select("id, business_id")
      .eq("provider", provider)
      .eq("environment", environment)
      .eq("provider_subscription_id", incoming.subscriptionId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      subscriptionId = data.id as string;
      businessId = data.business_id as string;
    }
  }
  if (!businessId) return null;

  const status = mergePaymentStatus(existing?.status ?? null, incoming.status);
  const fields = {
    business_id: businessId,
    subscription_id: subscriptionId,
    provider_invoice_id: incoming.invoiceId,
    provider_order_id: incoming.orderId,
    invoice_number: incoming.invoiceNumber,
    amount: incoming.amount,
    tax_amount: incoming.taxAmount,
    currency: incoming.currency,
    status,
    payment_method_type: incoming.methodType,
    paid_at: incoming.paidAt,
    failed_at: incoming.failedAt,
    failure_code: incoming.failureCode,
    failure_message_safe: incoming.failureMessage,
    refunded_amount: Math.max(Number(existing?.refunded_amount ?? 0), incoming.refundedAmount),
    updated_at: new Date().toISOString(),
  };
  // Fields a partial event doesn't carry never erase what a fuller one stored -- except a
  // recovered payment, whose earlier failure no longer describes it.
  const updateFields: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined));
  if (status === "succeeded") Object.assign(updateFields, { failure_code: null, failure_message_safe: null });

  let id: string;
  if (existing) {
    const { error } = await platform
      .from("billing_payments")
      .update({ ...updateFields, ...(incoming.id ? { provider_payment_id: incoming.id } : {}) })
      .eq("id", existing.id);
    if (error) throw error;
    id = existing.id;
  } else {
    const { data, error } = await platform
      .from("billing_payments")
      .insert({ ...fields, provider, environment, provider_payment_id: incoming.id })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return syncPayment(provider, environment, incoming);
      throw error;
    }
    id = data.id as string;
  }

  const previousStatus = existing?.status ?? null;
  if (previousStatus !== status) {
    const action =
      status === "succeeded"
        ? "billing.payment_succeeded"
        : status === "failed"
          ? "billing.payment_failed"
          : status === "refunded" || status === "partially_refunded"
            ? "billing.payment_refunded"
            : status === "disputed" || status === "chargeback"
              ? "billing.payment_disputed"
              : null;
    if (action) {
      await auditBilling(businessId, action, "billing_payment", id, {
        provider,
        amount: incoming.amount,
        currency: incoming.currency,
        status,
        failure_code: incoming.failureCode,
      });
    }
  }
  if (previousStatus !== status && (status === "succeeded" || status === "failed" || (status === "pending" && incoming.failureCode === null && incoming.invoiceId && !existing))) {
    const amount = new Intl.NumberFormat("en-IN", { style: "currency", currency: incoming.currency }).format(incoming.amount);
    const type = status === "succeeded" ? "billing.payment_succeeded" : status === "failed" ? "billing.payment_failed" : "billing.payment_action_required";
    await publishBillingNotification(businessId, type, { amount });
  }
  logBilling("billing.payment", { business_id: businessId, subscription_id: subscriptionId, provider, operation: "sync", status });
  return { id, businessId, status, previousStatus };
}

/** PLATFORM-P1-04.3 -- pure: stamp past_due_since on entering past_due, keep it while the
 * subscription stays past_due, clear it on leaving. Exported for tests. */
export function pastDueSinceField(previous: SubscriptionStatus | null, next: SubscriptionStatus, now: Date = new Date()): { past_due_since?: string | null } {
  if (next !== "past_due") return { past_due_since: null };
  return previous === "past_due" ? {} : { past_due_since: now.toISOString() };
}
