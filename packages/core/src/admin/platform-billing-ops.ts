import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { auditBilling } from "../billing/observability";
import { createProvider, loadProviderConfig } from "../billing/provider-config";
import { reconcileSubscriptionLicenses } from "../billing/provisioning";
import { SUBSCRIPTION_STATUS_LABEL } from "../billing/state";
import { syncSubscription } from "../billing/sync";
import { processBillingEvent } from "../billing/webhooks";
import { BillingProviderError, type BillingProviderKey, type PaymentStatus, type SubscriptionStatus } from "../billing/subscription-types";

/**
 * BILL-26..BILL-32 -- Platform Admin's billing console (§36-§39, §44-§46, §78): overview,
 * subscriptions, payments, webhook events, plan price mappings and reconciliation.
 *
 * Every function starts with requireSuperadmin(). Reads then use the service role, because
 * the console joins across every business (names, plans) that no RLS policy opens to a
 * superadmin's session; writes to plan prices go through the session so their audit
 * trigger records who made them. Nothing returned carries a secret or a raw provider
 * payload; webhook events expose their type and processing state, not their body.
 */

const platformAdmin = () => createAdminClient({ schema: "platform" });
const coreAdmin = () => createAdminClient({ schema: "core" });

type Result = { ok: true } | { ok: false; error: string };
const reason = z.string().trim().min(1, "A reason is required.").max(500);

async function businessNames(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await coreAdmin().from("businesses").select("id, name").in("id", unique);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
}

async function planNames(): Promise<Map<string, { key: string; name: string }>> {
  const { data, error } = await platformAdmin().from("plans").select("id, key, name");
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; key: string; name: string }[]).map((p) => [p.id, { key: p.key, name: p.name }]));
}

// ---------------------------------------------------------------------------------------
// Overview (§36, §44, §99)
// ---------------------------------------------------------------------------------------

export type PlatformBillingOverview = {
  activeSubscriptions: number;
  pastDue: number;
  cancelScheduled: number;
  /** Monthly recurring revenue per currency, from entitled paid subscriptions. */
  mrr: { currency: string; amount: number }[];
  payments30d: { succeeded: number; failed: number; refunded: number };
  revenue30d: { currency: string; amount: number }[];
  webhooks24h: { received: number; failed: number; unhandled: number };
  checkouts30d: { started: number; completed: number; failed: number; expired: number };
  failedEvents: number;
};

export async function getPlatformBillingOverview(): Promise<PlatformBillingOverview> {
  await requireSuperadmin();
  const platform = platformAdmin();
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const since24 = new Date(Date.now() - 86400_000).toISOString();
  const [subs, payments, events, checkouts, failedEvents] = await Promise.all([
    platform.from("subscriptions").select("status, provider, amount, currency, billing_interval").in("status", ["active", "trialing", "past_due", "cancel_scheduled", "unpaid", "paused"]),
    platform.from("billing_payments").select("status, amount, refunded_amount, currency").gte("created_at", since30),
    platform.from("billing_events").select("processing_status").gte("received_at", since24),
    platform.from("checkout_sessions").select("status").neq("provider", "internal").gte("created_at", since30),
    platform.from("billing_events").select("id", { count: "exact", head: true }).eq("processing_status", "failed"),
  ]);
  for (const r of [subs, payments, events, checkouts, failedEvents]) if (r.error) throw r.error;

  const subRows = (subs.data ?? []) as { status: SubscriptionStatus; provider: string; amount: number | string | null; currency: string | null; billing_interval: string | null }[];
  const mrr = new Map<string, number>();
  for (const s of subRows) {
    if (s.provider === "internal" || !s.currency || s.amount == null) continue;
    if (!["active", "trialing", "past_due", "cancel_scheduled"].includes(s.status)) continue;
    const monthly = s.billing_interval === "year" ? Number(s.amount) / 12 : Number(s.amount);
    mrr.set(s.currency, (mrr.get(s.currency) ?? 0) + monthly);
  }
  const paymentRows = (payments.data ?? []) as { status: PaymentStatus; amount: number | string; refunded_amount: number | string; currency: string }[];
  const revenue = new Map<string, number>();
  for (const p of paymentRows) {
    if (p.status === "succeeded" || p.status === "partially_refunded" || p.status === "refunded") {
      revenue.set(p.currency, (revenue.get(p.currency) ?? 0) + Number(p.amount) - Number(p.refunded_amount ?? 0));
    }
  }
  const eventRows = (events.data ?? []) as { processing_status: string }[];
  const checkoutRows = (checkouts.data ?? []) as { status: string }[];
  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    activeSubscriptions: subRows.filter((s) => s.provider !== "internal" && ["active", "trialing"].includes(s.status)).length,
    pastDue: subRows.filter((s) => s.status === "past_due" || s.status === "unpaid").length,
    cancelScheduled: subRows.filter((s) => s.status === "cancel_scheduled").length,
    mrr: [...mrr].map(([currency, amount]) => ({ currency, amount: round(amount) })),
    payments30d: {
      succeeded: paymentRows.filter((p) => p.status === "succeeded").length,
      failed: paymentRows.filter((p) => p.status === "failed").length,
      refunded: paymentRows.filter((p) => p.status === "refunded" || p.status === "partially_refunded").length,
    },
    revenue30d: [...revenue].map(([currency, amount]) => ({ currency, amount: round(amount) })),
    webhooks24h: {
      received: eventRows.length,
      failed: eventRows.filter((e) => e.processing_status === "failed").length,
      unhandled: eventRows.filter((e) => e.processing_status === "unhandled").length,
    },
    checkouts30d: {
      started: checkoutRows.length,
      completed: checkoutRows.filter((c) => c.status === "completed").length,
      failed: checkoutRows.filter((c) => c.status === "failed").length,
      expired: checkoutRows.filter((c) => c.status === "expired").length,
    },
    failedEvents: failedEvents.count ?? 0,
  };
}

// ---------------------------------------------------------------------------------------
// Subscriptions (§37, §45, §46)
// ---------------------------------------------------------------------------------------

export type PlatformSubscriptionRow = {
  id: string;
  businessId: string;
  businessName: string;
  planKey: string;
  planName: string;
  provider: BillingProviderKey | "internal";
  environment: "test" | "live";
  status: SubscriptionStatus;
  statusLabel: string;
  providerStatus: string | null;
  billingInterval: string | null;
  currency: string | null;
  amount: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanName: string | null;
  providerSubscriptionId: string | null;
  createdAt: string;
};

export async function listPlatformSubscriptions(filters: { status?: string; provider?: string; search?: string } = {}): Promise<PlatformSubscriptionRow[]> {
  await requireSuperadmin();
  let query = platformAdmin()
    .from("subscriptions")
    .select("id, business_id, plan_id, provider, environment, status, provider_status, billing_interval, currency, amount, current_period_end, cancel_at_period_end, pending_plan_id, provider_subscription_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.provider) query = query.eq("provider", filters.provider);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const [names, plans] = await Promise.all([businessNames(rows.map((r) => r.business_id as string)), planNames()]);
  const mapped = rows.map((r) => ({
    id: r.id as string,
    businessId: r.business_id as string,
    businessName: names.get(r.business_id as string) ?? "Unknown business",
    planKey: plans.get(r.plan_id as string)?.key ?? "",
    planName: plans.get(r.plan_id as string)?.name ?? "Unknown plan",
    provider: r.provider as PlatformSubscriptionRow["provider"],
    environment: r.environment as "test" | "live",
    status: r.status as SubscriptionStatus,
    statusLabel: SUBSCRIPTION_STATUS_LABEL[r.status as SubscriptionStatus] ?? String(r.status),
    providerStatus: (r.provider_status as string | null) ?? null,
    billingInterval: (r.billing_interval as string | null) ?? null,
    currency: (r.currency as string | null) ?? null,
    amount: r.amount == null ? null : Number(r.amount),
    currentPeriodEnd: (r.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    pendingPlanName: r.pending_plan_id ? (plans.get(r.pending_plan_id as string)?.name ?? null) : null,
    providerSubscriptionId: (r.provider_subscription_id as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
  const search = filters.search?.trim().toLowerCase();
  return search ? mapped.filter((s) => s.businessName.toLowerCase().includes(search) || (s.providerSubscriptionId ?? "").toLowerCase().includes(search)) : mapped;
}

export type PlatformSubscriptionDetail = PlatformSubscriptionRow & {
  payments: PlatformPaymentRow[];
  events: PlatformBillingEventRow[];
  licenses: { moduleKey: string; status: string; source: string; ownedByThisSubscription: boolean }[];
};

export async function getPlatformSubscription(id: string): Promise<PlatformSubscriptionDetail | null> {
  await requireSuperadmin();
  const list = await listPlatformSubscriptionsById(id);
  if (!list) return null;
  const [payments, events, { data: licenses, error }] = await Promise.all([
    listPlatformPayments({ subscriptionId: id }),
    listPlatformBillingEvents({ subscriptionId: id }),
    coreAdmin().from("licenses").select("module_key, status, source, subscription_id").eq("business_id", list.businessId),
  ]);
  if (error) throw error;
  return {
    ...list,
    payments,
    events,
    licenses: ((licenses ?? []) as { module_key: string; status: string; source: string; subscription_id: string | null }[]).map((l) => ({
      moduleKey: l.module_key,
      status: l.status,
      source: l.source,
      ownedByThisSubscription: l.subscription_id === id,
    })),
  };
}

async function listPlatformSubscriptionsById(id: string): Promise<PlatformSubscriptionRow | null> {
  const { data, error } = await platformAdmin()
    .from("subscriptions")
    .select("id, business_id, plan_id, provider, environment, status, provider_status, billing_interval, currency, amount, current_period_end, cancel_at_period_end, pending_plan_id, provider_subscription_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw error;
  }
  if (!data) return null;
  const r = data as Record<string, unknown>;
  const [names, plans] = await Promise.all([businessNames([r.business_id as string]), planNames()]);
  return {
    id: r.id as string,
    businessId: r.business_id as string,
    businessName: names.get(r.business_id as string) ?? "Unknown business",
    planKey: plans.get(r.plan_id as string)?.key ?? "",
    planName: plans.get(r.plan_id as string)?.name ?? "Unknown plan",
    provider: r.provider as PlatformSubscriptionRow["provider"],
    environment: r.environment as "test" | "live",
    status: r.status as SubscriptionStatus,
    statusLabel: SUBSCRIPTION_STATUS_LABEL[r.status as SubscriptionStatus] ?? String(r.status),
    providerStatus: (r.provider_status as string | null) ?? null,
    billingInterval: (r.billing_interval as string | null) ?? null,
    currency: (r.currency as string | null) ?? null,
    amount: r.amount == null ? null : Number(r.amount),
    currentPeriodEnd: (r.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    pendingPlanName: r.pending_plan_id ? (plans.get(r.pending_plan_id as string)?.name ?? null) : null,
    providerSubscriptionId: (r.provider_subscription_id as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

export type SyncDifference = { field: string; wonderark: string; provider: string };

/** §45/§46 step 1 -- compare WonderArk's record with the provider's, without changing
 * anything. Differences are shown to the admin, never silently applied. */
export async function previewSubscriptionSync(id: string): Promise<{ ok: true; differences: SyncDifference[] } | { ok: false; error: string }> {
  await requireSuperadmin();
  const sub = await listPlatformSubscriptionsById(id);
  if (!sub) return { ok: false, error: "Subscription not found." };
  if (sub.provider === "internal" || !sub.providerSubscriptionId) return { ok: false, error: "Internal subscriptions have no provider record to compare." };
  const config = await loadProviderConfig(sub.provider);
  if (!config?.secretKey || config.environment !== sub.environment) return { ok: false, error: `The ${sub.provider} ${sub.environment} credentials aren't configured.` };
  try {
    const remote = await createProvider(config).getSubscription(sub.providerSubscriptionId);
    const differences: SyncDifference[] = [];
    const compare = (field: string, ours: unknown, theirs: unknown) => {
      const a = ours == null ? "—" : String(ours);
      const b = theirs == null ? "—" : String(theirs);
      if (a !== b) differences.push({ field, wonderark: a, provider: b });
    };
    compare("status", sub.status, remote.status);
    compare("provider status", sub.providerStatus, remote.providerStatus);
    compare("cancel at period end", sub.cancelAtPeriodEnd, remote.cancelAtPeriodEnd);
    compare("period end", sub.currentPeriodEnd?.slice(0, 16), remote.currentPeriodEnd?.slice(0, 16));
    return { ok: true, differences };
  } catch (error) {
    return { ok: false, error: error instanceof BillingProviderError ? `${error.provider} ${error.operation}: ${error.code}` : "Could not reach the provider." };
  }
}

/** §45 step 2 -- apply the provider's state through the same mapping webhooks use, then
 * reconcile licences. Deterministic: nothing is copied across unmapped. */
export async function applySubscriptionSync(id: string, input: { reason: string }): Promise<Result> {
  await requireSuperadmin();
  const parsed = reason.safeParse(input.reason);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "A reason is required." };
  const sub = await listPlatformSubscriptionsById(id);
  if (!sub || sub.provider === "internal" || !sub.providerSubscriptionId) return { ok: false, error: "Nothing to sync for this subscription." };
  const config = await loadProviderConfig(sub.provider);
  if (!config?.secretKey || config.environment !== sub.environment) return { ok: false, error: "Provider credentials aren't configured." };
  try {
    const remote = await createProvider(config).getSubscription(sub.providerSubscriptionId);
    const synced = await syncSubscription(sub.provider, sub.environment, remote);
    await reconcileSubscriptionLicenses(synced.id);
    const actor = await currentUserId();
    await auditBilling(sub.businessId, "billing.subscription_synced", "subscription", id, { from: sub.status, to: synced.status, reason: parsed.data }, actor);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof BillingProviderError ? `${error.provider} ${error.operation}: ${error.code}` : "Sync failed." };
  }
}

/** Re-runs licence reconciliation alone (§46 "Review" -> fix). */
export async function reconcilePlatformSubscriptionLicenses(id: string): Promise<Result> {
  await requireSuperadmin();
  try {
    await reconcileSubscriptionLicenses(id);
    return { ok: true };
  } catch {
    return { ok: false, error: "Reconciliation failed." };
  }
}

/** §8 -- immediate cancellation is an explicit administrative action. */
export async function adminCancelSubscription(id: string, input: { immediate: boolean; reason: string }): Promise<Result> {
  await requireSuperadmin();
  const parsed = reason.safeParse(input.reason);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "A reason is required." };
  const sub = await listPlatformSubscriptionsById(id);
  if (!sub) return { ok: false, error: "Subscription not found." };
  const actor = await currentUserId();
  try {
    if (sub.provider === "internal" || !sub.providerSubscriptionId) {
      const { error } = await platformAdmin().from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    } else {
      const config = await loadProviderConfig(sub.provider);
      if (!config?.secretKey || config.environment !== sub.environment) return { ok: false, error: "Provider credentials aren't configured." };
      const updated = await createProvider(config).cancelSubscription(sub.providerSubscriptionId, { atPeriodEnd: !input.immediate });
      await syncSubscription(sub.provider, sub.environment, updated);
    }
    await reconcileSubscriptionLicenses(id);
    await auditBilling(sub.businessId, "billing.subscription_cancelled", "subscription", id, { by: "platform_admin", immediate: input.immediate, reason: parsed.data }, actor);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof BillingProviderError ? `${error.provider} ${error.operation}: ${error.code} -- ${error.message}` : "Cancellation failed." };
  }
}

// ---------------------------------------------------------------------------------------
// Payments (§38, §78)
// ---------------------------------------------------------------------------------------

export type PlatformPaymentRow = {
  id: string;
  businessId: string;
  businessName: string;
  subscriptionId: string | null;
  provider: BillingProviderKey;
  environment: "test" | "live";
  providerPaymentId: string | null;
  providerInvoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  taxAmount: number | null;
  currency: string;
  status: PaymentStatus;
  methodType: string | null;
  paidAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  refundedAmount: number;
  createdAt: string;
};

export async function listPlatformPayments(filters: { status?: string; provider?: string; subscriptionId?: string } = {}): Promise<PlatformPaymentRow[]> {
  await requireSuperadmin();
  let query = platformAdmin()
    .from("billing_payments")
    .select("id, business_id, subscription_id, provider, environment, provider_payment_id, provider_invoice_id, invoice_number, amount, tax_amount, currency, status, payment_method_type, paid_at, failure_code, failure_message_safe, refunded_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.provider) query = query.eq("provider", filters.provider);
  if (filters.subscriptionId) query = query.eq("subscription_id", filters.subscriptionId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await businessNames(rows.map((r) => r.business_id as string));
  return rows.map((r) => ({
    id: r.id as string,
    businessId: r.business_id as string,
    businessName: names.get(r.business_id as string) ?? "Unknown business",
    subscriptionId: (r.subscription_id as string | null) ?? null,
    provider: r.provider as BillingProviderKey,
    environment: r.environment as "test" | "live",
    providerPaymentId: (r.provider_payment_id as string | null) ?? null,
    providerInvoiceId: (r.provider_invoice_id as string | null) ?? null,
    invoiceNumber: (r.invoice_number as string | null) ?? null,
    amount: Number(r.amount),
    taxAmount: r.tax_amount == null ? null : Number(r.tax_amount),
    currency: r.currency as string,
    status: r.status as PaymentStatus,
    methodType: (r.payment_method_type as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    failureCode: (r.failure_code as string | null) ?? null,
    failureMessage: (r.failure_message_safe as string | null) ?? null,
    refundedAmount: Number(r.refunded_amount ?? 0),
    createdAt: r.created_at as string,
  }));
}

export const refundPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  /** Blank = full refund of what remains. */
  amount: z
    .union([z.literal(""), z.coerce.number().positive("Enter an amount above zero.")])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  reason,
});

/**
 * §78 -- ask the provider for a refund. The payment row is NOT marked refunded here: the
 * provider's refund webhook (or the next sync) records it once it has actually happened.
 */
export async function refundPlatformPayment(input: z.input<typeof refundPaymentSchema>): Promise<Result & { refundId?: string }> {
  await requireSuperadmin();
  const parsed = refundPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid refund." };
  const { data, error } = await platformAdmin()
    .from("billing_payments")
    .select("id, business_id, provider, environment, provider_payment_id, amount, refunded_amount, status")
    .eq("id", parsed.data.paymentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "Payment not found." };
  const payment = data as { id: string; business_id: string; provider: BillingProviderKey; environment: "test" | "live"; provider_payment_id: string | null; amount: number | string; refunded_amount: number | string; status: PaymentStatus };
  if (!payment.provider_payment_id) return { ok: false, error: "This payment has no provider payment id to refund." };
  if (payment.status !== "succeeded" && payment.status !== "partially_refunded") return { ok: false, error: "Only a captured payment can be refunded." };
  const remaining = Number(payment.amount) - Number(payment.refunded_amount ?? 0);
  if (parsed.data.amount !== null && parsed.data.amount > remaining + 0.001) return { ok: false, error: `At most ${remaining.toFixed(2)} can be refunded.` };

  const config = await loadProviderConfig(payment.provider);
  if (!config?.secretKey || config.environment !== payment.environment) return { ok: false, error: "Provider credentials aren't configured." };
  try {
    const refund = await createProvider(config).refundPayment(payment.provider_payment_id, { amount: parsed.data.amount, reason: parsed.data.reason });
    const actor = await currentUserId();
    await auditBilling(payment.business_id, "billing.refund_created", "billing_payment", payment.id, {
      provider: payment.provider,
      amount: parsed.data.amount ?? remaining,
      refund_status: refund.status,
      reason: parsed.data.reason,
    }, actor);
    return { ok: true, refundId: refund.refundId };
  } catch (error) {
    return { ok: false, error: error instanceof BillingProviderError ? `${error.provider} ${error.operation}: ${error.code} -- ${error.message}` : "Refund failed." };
  }
}

// ---------------------------------------------------------------------------------------
// Webhook events (§39, §44, §96)
// ---------------------------------------------------------------------------------------

export type PlatformBillingEventRow = {
  id: string;
  provider: BillingProviderKey;
  environment: "test" | "live";
  providerEventId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  receivedAt: string;
  processedAt: string | null;
  businessId: string | null;
  businessName: string | null;
  subscriptionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export async function listPlatformBillingEvents(filters: { status?: string; provider?: string; subscriptionId?: string } = {}): Promise<PlatformBillingEventRow[]> {
  await requireSuperadmin();
  let query = platformAdmin()
    .from("billing_events")
    .select("id, provider, environment, provider_event_id, event_type, processing_status, attempt_count, received_at, processed_at, business_id, subscription_id, error_code, error_message_safe")
    .order("received_at", { ascending: false })
    .limit(200);
  if (filters.status) query = query.eq("processing_status", filters.status);
  if (filters.provider) query = query.eq("provider", filters.provider);
  if (filters.subscriptionId) query = query.eq("subscription_id", filters.subscriptionId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await businessNames(rows.map((r) => r.business_id as string));
  return rows.map((r) => ({
    id: r.id as string,
    provider: r.provider as BillingProviderKey,
    environment: r.environment as "test" | "live",
    providerEventId: r.provider_event_id as string,
    eventType: r.event_type as string,
    status: r.processing_status as string,
    attemptCount: Number(r.attempt_count ?? 0),
    receivedAt: r.received_at as string,
    processedAt: (r.processed_at as string | null) ?? null,
    businessId: (r.business_id as string | null) ?? null,
    businessName: r.business_id ? (names.get(r.business_id as string) ?? null) : null,
    subscriptionId: (r.subscription_id as string | null) ?? null,
    errorCode: (r.error_code as string | null) ?? null,
    errorMessage: (r.error_message_safe as string | null) ?? null,
  }));
}

/** §96 -- reprocess a stored event now (it is re-parsed from the stored, verified payload;
 * nothing new is trusted). */
export async function retryPlatformBillingEvent(id: string): Promise<Result & { outcome?: string }> {
  await requireSuperadmin();
  const { data, error } = await platformAdmin().from("billing_events").select("processing_status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "Event not found." };
  if (data.processing_status === "processed") return { ok: false, error: "This event was already processed." };
  // An unhandled event is retried by first making it eligible again.
  if (data.processing_status === "unhandled") {
    await platformAdmin().from("billing_events").update({ processing_status: "failed" }).eq("id", id);
  }
  const outcome = await processBillingEvent(id);
  return outcome === "failed" ? { ok: false, error: "Processing failed again -- see the event's error." } : { ok: true, outcome };
}

// ---------------------------------------------------------------------------------------
// Plan price mappings (§35, §72) -- written through the session so the audit trigger
// (platform.log_plan_price_audit) records the superadmin who changed them.
// ---------------------------------------------------------------------------------------

export type PlanPriceRow = {
  id: string;
  planId: string;
  provider: BillingProviderKey;
  environment: "test" | "live";
  currency: string;
  billingInterval: "month" | "year";
  amount: number;
  providerProductId: string | null;
  providerPriceId: string;
  active: boolean;
  updatedAt: string;
};

export async function listPlanPrices(planId?: string): Promise<PlanPriceRow[]> {
  await requireSuperadmin();
  let query = platformAdmin()
    .from("plan_prices")
    .select("id, plan_id, provider, environment, currency, billing_interval, amount, provider_product_id, provider_price_id, active, updated_at")
    .order("provider")
    .order("environment")
    .order("billing_interval");
  if (planId) query = query.eq("plan_id", planId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    planId: r.plan_id as string,
    provider: r.provider as BillingProviderKey,
    environment: r.environment as "test" | "live",
    currency: r.currency as string,
    billingInterval: r.billing_interval as "month" | "year",
    amount: Number(r.amount),
    providerProductId: (r.provider_product_id as string | null) ?? null,
    providerPriceId: r.provider_price_id as string,
    active: Boolean(r.active),
    updatedAt: r.updated_at as string,
  }));
}

export const createPlanPriceSchema = z.object({
  planId: z.string().uuid(),
  provider: z.enum(["razorpay", "stripe"]),
  environment: z.enum(["test", "live"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code."),
  billingInterval: z.enum(["month", "year"]),
  amount: z.coerce.number().min(0, "Amount can't be negative.").max(100_000_000),
  providerProductId: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  providerPriceId: z.string().trim().min(1, "Enter the provider's price / plan id.").max(200),
});

/** Records a price created at the provider. Replaces any active price for the same plan,
 * provider, environment, currency and interval (the old one is deactivated, not deleted --
 * existing subscriptions on it keep resolving their plan). */
export async function createPlanPrice(input: z.input<typeof createPlanPriceSchema>): Promise<Result> {
  await requireSuperadmin();
  const parsed = createPlanPriceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid price." };
  const d = parsed.data;
  if (d.provider === "razorpay" && !d.providerPriceId.startsWith("plan_")) return { ok: false, error: "A Razorpay plan id starts with plan_." };
  if (d.provider === "stripe" && !d.providerPriceId.startsWith("price_")) return { ok: false, error: "A Stripe price id starts with price_." };
  const supabase = await createClient({ schema: "platform" });
  const { error: deactivateError } = await supabase
    .from("plan_prices")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("plan_id", d.planId)
    .eq("provider", d.provider)
    .eq("environment", d.environment)
    .eq("currency", d.currency)
    .eq("billing_interval", d.billingInterval)
    .eq("active", true);
  if (deactivateError) return { ok: false, error: deactivateError.message };
  const { error } = await supabase.from("plan_prices").insert({
    plan_id: d.planId,
    provider: d.provider,
    environment: d.environment,
    currency: d.currency,
    billing_interval: d.billingInterval,
    amount: d.amount,
    provider_product_id: d.providerProductId ?? null,
    provider_price_id: d.providerPriceId,
    active: true,
    updated_by: await currentUserId(),
  });
  if (error) return { ok: false, error: error.code === "23505" ? "That provider price id is already mapped." : error.message };
  return { ok: true };
}

export async function setPlanPriceActive(id: string, active: boolean): Promise<Result> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.from("plan_prices").update({ active, updated_at: new Date().toISOString(), updated_by: await currentUserId() }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "Another active price already covers this plan, provider, currency and interval." : error.message };
  return { ok: true };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}
