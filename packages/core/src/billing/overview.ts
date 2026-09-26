import { createClient } from "../db/server";
import type { ModuleKey } from "../licensing/types";
import { getBillingManager } from "./access";
import { listActivePlanPrices, listPurchasablePlans, type CatalogPlan } from "./catalog";
import { isCheckoutReady, loadProviderConfigs } from "./provider-config";
import type { BillingInterval, BillingProviderKey, PaymentStatus, SubscriptionStatus } from "./subscription-types";

/**
 * BILL-19 / BILL-20 -- what the customer billing pages read. Subscription and payment rows
 * come through the signed-in user's own session, so RLS decides what they see: every
 * member sees the plan, only account owners/admins see payments (§83). Nothing here
 * returns a provider secret, a provider customer id or a raw payload.
 */

export type BusinessSubscription = {
  id: string;
  planId: string;
  planKey: string;
  planName: string;
  provider: BillingProviderKey | "internal";
  status: SubscriptionStatus;
  billingInterval: BillingInterval | null;
  currency: string | null;
  amount: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanName: string | null;
  pendingChangeAt: string | null;
};

export type BillingPaymentSummary = {
  id: string;
  description: string | null;
  invoiceNumber: string | null;
  amount: number;
  taxAmount: number | null;
  currency: string;
  status: PaymentStatus;
  methodType: string | null;
  paidAt: string | null;
  failedAt: string | null;
  failureMessage: string | null;
  refundedAmount: number;
  createdAt: string;
};

export type PlanOption = CatalogPlan & {
  modules: ModuleKey[];
  /** Per interval, what this business would pay -- only intervals a ready provider can bill. */
  prices: Partial<Record<BillingInterval, { amount: number; currency: string }>>;
};

export async function getBusinessSubscription(businessId: string): Promise<BusinessSubscription | null> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "id, plan_id, provider, status, billing_interval, currency, amount, current_period_start, current_period_end, cancel_at_period_end, pending_plan_id, pending_change_at, created_at",
    )
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const live = new Set(["trialing", "active", "past_due", "paused", "cancel_scheduled", "unpaid"]);
  // The live one if there is one; otherwise the latest (so a lapsed plan still shows).
  const row = rows.find((r) => live.has(r.status as string)) ?? rows[0];
  if (!row) return null;

  const planIds = [row.plan_id, row.pending_plan_id].filter(Boolean) as string[];
  const { data: plans, error: planError } = await supabase.from("plans").select("id, key, name").in("id", planIds);
  if (planError) throw planError;
  const planById = new Map(((plans ?? []) as { id: string; key: string; name: string }[]).map((p) => [p.id, p]));
  const plan = planById.get(row.plan_id as string);

  return {
    id: row.id as string,
    planId: row.plan_id as string,
    planKey: plan?.key ?? "",
    planName: plan?.name ?? "Plan",
    provider: row.provider as BusinessSubscription["provider"],
    status: row.status as SubscriptionStatus,
    billingInterval: (row.billing_interval as BillingInterval | null) ?? null,
    currency: (row.currency as string | null) ?? null,
    amount: row.amount == null ? null : Number(row.amount),
    currentPeriodStart: (row.current_period_start as string | null) ?? null,
    currentPeriodEnd: (row.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    pendingPlanName: row.pending_plan_id ? (planById.get(row.pending_plan_id as string)?.name ?? null) : null,
    pendingChangeAt: (row.pending_change_at as string | null) ?? null,
  };
}

export async function listBusinessPayments(businessId: string, limit = 50): Promise<BillingPaymentSummary[]> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("billing_payments")
    .select("id, description, invoice_number, amount, tax_amount, currency, status, payment_method_type, paid_at, failed_at, failure_message_safe, refunded_amount, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    description: (r.description as string | null) ?? null,
    invoiceNumber: (r.invoice_number as string | null) ?? null,
    amount: Number(r.amount),
    taxAmount: r.tax_amount == null ? null : Number(r.tax_amount),
    currency: r.currency as string,
    status: r.status as PaymentStatus,
    methodType: (r.payment_method_type as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    failedAt: (r.failed_at as string | null) ?? null,
    failureMessage: (r.failure_message_safe as string | null) ?? null,
    refundedAmount: Number(r.refunded_amount ?? 0),
    createdAt: r.created_at as string,
  }));
}

/** The plan picker: every purchasable plan, the modules it licenses, and -- for paid
 * plans -- the price this business would actually be charged in its currency. */
export async function listPlanOptions(businessId: string): Promise<{ plans: PlanOption[]; currency: string; checkoutAvailable: boolean }> {
  const core = await createClient({ schema: "core" });
  const platform = await createClient({ schema: "platform" });
  const [{ data: settings }, plans, configs] = await Promise.all([
    core.from("business_settings").select("currency").eq("business_id", businessId).maybeSingle(),
    listPurchasablePlans(),
    loadProviderConfigs(),
  ]);
  const { data: moduleRows, error: moduleError } = await platform
    .from("plan_modules")
    .select("plan_id, module_key")
    .eq("enabled", true)
    .in("plan_id", plans.map((p) => p.id));
  if (moduleError) throw moduleError;

  const ready = configs.filter(isCheckoutReady);
  const fallbackCurrency = plans.find((p) => p.price > 0)?.currency ?? "INR";
  const currency = ((settings?.currency as string | null) ?? fallbackCurrency).toUpperCase();
  const takers = ready.filter((c) => c.supportedCurrencies.includes(currency)).sort((a, b) => a.priority - b.priority);
  const prices = takers.length > 0 ? await listActivePlanPrices() : [];

  const options = plans.map((plan) => {
    const optionPrices: PlanOption["prices"] = {};
    for (const interval of ["month", "year"] as const) {
      for (const taker of takers) {
        const price = prices.find(
          (p) => p.planId === plan.id && p.provider === taker.provider && p.environment === taker.environment && p.currency === currency && p.billingInterval === interval,
        );
        if (price) {
          optionPrices[interval] = { amount: price.amount, currency };
          break;
        }
      }
    }
    return {
      ...plan,
      modules: ((moduleRows ?? []) as { plan_id: string; module_key: ModuleKey }[]).filter((m) => m.plan_id === plan.id).map((m) => m.module_key),
      prices: optionPrices,
    };
  });
  return { plans: options, currency, checkoutAvailable: options.some((o) => Object.keys(o.prices).length > 0) };
}

export async function canManageBilling(businessId: string): Promise<boolean> {
  return (await getBillingManager(businessId)) !== null;
}

/** For the success page's polling: the status of one checkout session the signed-in user
 * started (RLS: requesters only), and the subscription it produced. */
export async function getCheckoutSessionStatus(
  sessionId: string,
): Promise<{ status: string; subscriptionStatus: SubscriptionStatus | null; planName: string | null; failureMessage: string | null } | null> {
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("checkout_sessions")
    .select("status, subscription_id, plan_id, failure_message_safe")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw error;
  }
  if (!data) return null;
  const [{ data: sub }, { data: plan }] = await Promise.all([
    data.subscription_id
      ? supabase.from("subscriptions").select("status").eq("id", data.subscription_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("plans").select("name").eq("id", data.plan_id).maybeSingle(),
  ]);
  return {
    status: data.status as string,
    subscriptionStatus: ((sub as { status?: SubscriptionStatus } | null)?.status as SubscriptionStatus | undefined) ?? null,
    planName: (plan?.name as string | undefined) ?? null,
    failureMessage: (data.failure_message_safe as string | null) ?? null,
  };
}
