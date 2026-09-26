import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BillingProviderError,
  WebhookVerificationError,
  type BillingProvider,
  type ChangeTiming,
  type CreateCheckoutInput,
  type PaymentStatus,
  type ProviderCheckout,
  type ProviderConfig,
  type ProviderPayment,
  type ProviderSubscription,
  type ProviderWebhookEvent,
} from "../subscription-types";
import { mapStripeStatus } from "../state";
import { fromMinorUnits, isoFromUnix, providerRequest, toMinorUnits } from "./http";

/**
 * BILL-05 -- the Stripe adapter: Checkout for payment collection, the Customer Portal for
 * payment methods and invoices (§3.2, §74), and verified webhooks for every state change.
 *
 * REST over fetch, form-encoded, with the API version pinned so the response shapes read
 * here don't shift under us. Webhook payloads arrive in the endpoint's own configured
 * version, so the subscription reader accepts both the older top-level period fields and
 * the newer per-item ones.
 */
const API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2024-06-20";
/** Stripe's own default replay window for webhook signatures. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

type FormValue = string | number | boolean | null | undefined | Form | Form[] | string[];
interface Form {
  [key: string]: FormValue;
}

/** Stripe's nested form encoding: a[b][0][c]=v. */
export function encodeForm(data: Form, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object") parts.push(encodeForm(item as Form, `${name}[${index}]`));
        else parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      parts.push(encodeForm(value as Form, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

type StripeSubscription = {
  id: string;
  customer: string | { id: string } | null;
  status: string;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  current_period_start?: number;
  current_period_end?: number;
  trial_start?: number | null;
  trial_end?: number | null;
  metadata?: Record<string, string>;
  items?: { data?: { id: string; price?: { id: string }; current_period_start?: number; current_period_end?: number }[] };
};

type StripeInvoice = {
  id: string;
  number?: string | null;
  subscription?: string | { id: string } | null;
  parent?: { subscription_details?: { subscription?: string } | null } | null;
  amount_paid?: number;
  amount_due?: number;
  tax?: number | null;
  total_taxes?: { amount: number }[] | null;
  currency: string;
  payment_intent?: string | { id: string } | null;
  status_transitions?: { paid_at?: number | null } | null;
  created?: number;
};

type StripeCharge = {
  id: string;
  payment_intent?: string | null;
  invoice?: string | null;
  amount: number;
  amount_refunded: number;
  currency: string;
  refunded?: boolean;
  created?: number;
  payment_method_details?: { type?: string } | null;
};

const idOf = (value: string | { id: string } | null | undefined): string | null =>
  value == null ? null : typeof value === "string" ? value : value.id;

export function toProviderSubscription(sub: StripeSubscription): ProviderSubscription {
  const item = sub.items?.data?.[0];
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  return {
    id: sub.id,
    customerId: idOf(sub.customer),
    status: mapStripeStatus(sub.status, cancelAtPeriodEnd),
    providerStatus: sub.status,
    providerPriceId: item?.price?.id ?? null,
    currentPeriodStart: isoFromUnix(sub.current_period_start ?? item?.current_period_start),
    currentPeriodEnd: isoFromUnix(sub.current_period_end ?? item?.current_period_end),
    cancelAtPeriodEnd,
    cancelledAt: isoFromUnix(sub.canceled_at),
    trialStart: isoFromUnix(sub.trial_start),
    trialEnd: isoFromUnix(sub.trial_end),
    metadata: sub.metadata ?? {},
  };
}

function invoicePayment(invoice: StripeInvoice, status: PaymentStatus): ProviderPayment {
  const currency = invoice.currency.toUpperCase();
  const tax = invoice.tax ?? (invoice.total_taxes ? invoice.total_taxes.reduce((sum, t) => sum + t.amount, 0) : null);
  const minor = status === "succeeded" ? invoice.amount_paid : invoice.amount_due;
  return {
    id: idOf(invoice.payment_intent),
    invoiceId: invoice.id,
    orderId: null,
    invoiceNumber: invoice.number ?? null,
    subscriptionId: idOf(invoice.subscription) ?? invoice.parent?.subscription_details?.subscription ?? null,
    amount: fromMinorUnits(minor ?? 0, currency) ?? 0,
    taxAmount: fromMinorUnits(tax, currency),
    currency,
    status,
    methodType: null,
    paidAt: status === "succeeded" ? isoFromUnix(invoice.status_transitions?.paid_at ?? invoice.created) : null,
    failedAt: status === "failed" ? isoFromUnix(invoice.created) ?? new Date().toISOString() : null,
    failureCode: status === "failed" ? "payment_failed" : null,
    failureMessage: status === "failed" ? "The payment could not be completed." : null,
    refundedAmount: 0,
  };
}

function chargePayment(charge: StripeCharge, status: PaymentStatus): ProviderPayment {
  const currency = charge.currency.toUpperCase();
  return {
    id: charge.payment_intent ?? charge.id,
    invoiceId: charge.invoice ?? null,
    orderId: null,
    invoiceNumber: null,
    subscriptionId: null,
    amount: fromMinorUnits(charge.amount, currency) ?? 0,
    taxAmount: null,
    currency,
    status,
    methodType: charge.payment_method_details?.type ?? null,
    paidAt: null,
    failedAt: null,
    failureCode: null,
    failureMessage: null,
    refundedAmount: fromMinorUnits(charge.amount_refunded, currency) ?? 0,
  };
}

/** Verifies `Stripe-Signature: t=...,v1=...` over `${t}.${rawBody}` (HMAC-SHA256), within
 * the replay window. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): void {
  if (!header) throw new WebhookVerificationError("Missing Stripe-Signature header.");
  const parts = header.split(",").map((p) => p.trim().split("="));
  const timestamp = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new WebhookVerificationError("Malformed Stripe-Signature header.");
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) throw new WebhookVerificationError("Stale webhook timestamp.");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"));
  const matched = signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) throw new WebhookVerificationError();
}

export function parseStripeEvent(rawBody: string): ProviderWebhookEvent {
  const event = JSON.parse(rawBody) as { id: string; type: string; created?: number; data?: { object?: unknown } };
  if (!event?.id || !event.type) throw new WebhookVerificationError("Malformed Stripe event.");
  const object = event.data?.object;
  const base = { id: event.id, type: event.type, occurredAt: isoFromUnix(event.created) };
  switch (event.type) {
    case "checkout.session.completed": {
      const session = object as { id: string; subscription?: string | null; customer?: string | null; client_reference_id?: string | null };
      return {
        ...base,
        kind: "checkout",
        checkout: {
          checkoutId: session.id,
          subscriptionId: session.subscription ?? null,
          customerId: session.customer ?? null,
          clientReference: session.client_reference_id ?? null,
        },
        subscriptionIdToRefresh: session.subscription ?? null,
      };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return { ...base, kind: "subscription", subscription: toProviderSubscription(object as StripeSubscription) };
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const payment = invoicePayment(object as StripeInvoice, "succeeded");
      return { ...base, kind: "payment", payment, subscriptionIdToRefresh: payment.subscriptionId };
    }
    case "invoice.payment_failed": {
      const payment = invoicePayment(object as StripeInvoice, "failed");
      return { ...base, kind: "payment", payment, subscriptionIdToRefresh: payment.subscriptionId };
    }
    case "invoice.payment_action_required": {
      const payment = invoicePayment(object as StripeInvoice, "pending");
      return { ...base, kind: "payment", payment, subscriptionIdToRefresh: payment.subscriptionId };
    }
    case "charge.refunded": {
      const charge = object as StripeCharge;
      const status: PaymentStatus = charge.amount_refunded >= charge.amount ? "refunded" : "partially_refunded";
      return { ...base, kind: "payment", payment: chargePayment(charge, status) };
    }
    case "charge.dispute.created": {
      const dispute = object as { charge?: string; payment_intent?: string | null; amount: number; currency: string };
      return {
        ...base,
        kind: "payment",
        payment: {
          ...chargePayment({ id: dispute.charge ?? "", payment_intent: dispute.payment_intent ?? null, amount: dispute.amount, amount_refunded: 0, currency: dispute.currency }, "disputed"),
        },
      };
    }
    default:
      return { ...base, kind: "unhandled" };
  }
}

export function createStripeProvider(config: ProviderConfig): BillingProvider {
  const secret = config.secretKey;
  const call = <T>(operation: string, path: string, method: "GET" | "POST" | "DELETE", body?: Form, idempotencyKey?: string) => {
    if (!secret) throw new BillingProviderError("stripe", operation, "not_configured", "Stripe isn't configured.");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${secret}`,
      "Stripe-Version": STRIPE_VERSION,
    };
    if (body) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return providerRequest<T>("stripe", operation, `${API}${path}`, { method, headers, body: body ? encodeForm(body) : undefined });
  };

  return {
    key: "stripe",

    async createCustomer({ businessId, name, email }) {
      const customer = await call<{ id: string }>(
        "create_customer",
        "/customers",
        "POST",
        { name, email: email ?? undefined, metadata: { business_id: businessId } },
        `customer-${businessId}-${config.environment}`,
      );
      return { id: customer.id };
    },

    async createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout> {
      const metadata = { business_id: input.businessId, checkout_session_id: input.sessionId, plan_key: input.planKey };
      const session = await call<{ id: string; url: string }>(
        "create_checkout",
        "/checkout/sessions",
        "POST",
        {
          mode: "subscription",
          customer: input.customerId,
          client_reference_id: input.sessionId,
          line_items: [{ price: input.providerPriceId, quantity: 1 }],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata,
          subscription_data: { metadata },
        },
        input.idempotencyKey,
      );
      return { checkoutId: session.id, subscriptionId: null, redirectUrl: session.url };
    },

    async getSubscription(subscriptionId) {
      return toProviderSubscription(await call<StripeSubscription>("get_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "GET"));
    },

    async cancelSubscription(subscriptionId, { atPeriodEnd }) {
      const sub = atPeriodEnd
        ? await call<StripeSubscription>("cancel_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "POST", { cancel_at_period_end: true })
        : await call<StripeSubscription>("cancel_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "DELETE");
      return toProviderSubscription(sub);
    },

    async resumeSubscription(subscriptionId) {
      return toProviderSubscription(
        await call<StripeSubscription>("resume_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "POST", { cancel_at_period_end: false }),
      );
    },

    async changeSubscription(subscriptionId, { providerPriceId, timing, prorate }: { providerPriceId: string; timing: ChangeTiming; prorate: boolean }) {
      const current = await call<StripeSubscription>("get_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "GET");
      const itemId = current.items?.data?.[0]?.id;
      if (!itemId) throw new BillingProviderError("stripe", "change_subscription", "no_item", "The subscription has no item to change.");
      // A next-renewal change is Stripe's own "no proration" update: the new price is billed
      // from the next invoice on. WonderArk keeps the current plan's access until then
      // (subscriptions.pending_plan_id), so nothing is lost mid-period.
      const sub = await call<StripeSubscription>("change_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "POST", {
        items: [{ id: itemId, price: providerPriceId }],
        proration_behavior: timing === "immediate" && prorate ? "create_prorations" : "none",
      });
      return toProviderSubscription(sub);
    },

    async createPortalSession({ customerId, returnUrl }) {
      const session = await call<{ url: string }>("create_portal", "/billing_portal/sessions", "POST", { customer: customerId, return_url: returnUrl });
      return { url: session.url };
    },

    async getPayment(paymentId) {
      const intent = await call<{ id: string; amount: number; amount_received: number; currency: string; status: string; latest_charge?: StripeCharge | string | null }>(
        "get_payment",
        `/payment_intents/${encodeURIComponent(paymentId)}?expand[]=latest_charge`,
        "GET",
      );
      const currency = intent.currency.toUpperCase();
      const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      const refunded = fromMinorUnits(charge?.amount_refunded ?? 0, currency) ?? 0;
      const amount = fromMinorUnits(intent.amount, currency) ?? 0;
      const status: PaymentStatus =
        refunded > 0 ? (refunded >= amount ? "refunded" : "partially_refunded") : intent.status === "succeeded" ? "succeeded" : intent.status === "canceled" ? "failed" : "pending";
      return { ...chargePayment(charge ?? { id: intent.id, amount: intent.amount, amount_refunded: 0, currency: intent.currency }, status), id: intent.id, amount, refundedAmount: refunded };
    },

    async refundPayment(paymentId, { amount, reason }) {
      const payment = await this.getPayment(paymentId);
      const refund = await call<{ id: string; status: string }>("refund_payment", "/refunds", "POST", {
        payment_intent: paymentId,
        amount: amount == null ? undefined : toMinorUnits(amount, payment.currency),
        metadata: { reason: reason.slice(0, 450) },
      });
      return { refundId: refund.id, status: refund.status };
    },

    verifyWebhook(rawBody, headers) {
      if (!config.webhookSecret) throw new WebhookVerificationError("Stripe webhook secret isn't configured.");
      verifyStripeSignature(rawBody, headers.get("stripe-signature"), config.webhookSecret);
      return parseStripeEvent(rawBody);
    },
  };
}
