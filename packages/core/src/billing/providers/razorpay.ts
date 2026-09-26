import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import {
  BillingProviderError,
  WebhookVerificationError,
  type BillingProvider,
  type CreateCheckoutInput,
  type PaymentStatus,
  type ProviderConfig,
  type ProviderPayment,
  type ProviderSubscription,
  type ProviderWebhookEvent,
} from "../subscription-types";
import { mapRazorpayStatus } from "../state";
import { fromMinorUnits, isoFromUnix, providerRequest, toMinorUnits } from "./http";

/**
 * BILL-04 -- the Razorpay Subscriptions adapter (§3.1, §23). Checkout is Razorpay's own
 * Checkout.js opened on a subscription WonderArk creates server-side; the browser only ever
 * receives the public Key ID and that subscription's id. Activation comes from verified
 * webhooks, never from the browser returning (§3.1: "never activate ... merely because the
 * browser returned").
 *
 * What Razorpay does not support is not emulated (§54): it has no customer portal, no
 * proration switch (its own plan change handles that), and no way to undo a cancellation
 * scheduled for the end of the cycle -- those calls say so plainly.
 */
const API = "https://api.razorpay.com/v1";

/** How many billing cycles a subscription runs before Razorpay ends it -- Razorpay requires
 * a finite count. Ten years either way; renewal simply continues until cancelled. */
const TOTAL_COUNT = { month: 120, year: 10 } as const;

type RazorpaySubscription = {
  id: string;
  plan_id: string;
  customer_id?: string | null;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  start_at?: number | null;
  short_url?: string | null;
  notes?: Record<string, string> | unknown[] | null;
};

type RazorpayPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  order_id?: string | null;
  invoice_id?: string | null;
  error_code?: string | null;
  error_description?: string | null;
  amount_refunded?: number;
  created_at?: number;
  subscription_id?: string | null;
  tax?: number | null;
};

function notesOf(notes: RazorpaySubscription["notes"]): Record<string, string> {
  // Razorpay returns an empty array, not an object, when there are no notes.
  return notes && !Array.isArray(notes) ? (notes as Record<string, string>) : {};
}

export function toProviderSubscription(sub: RazorpaySubscription, cancelAtPeriodEnd = false): ProviderSubscription {
  return {
    id: sub.id,
    customerId: sub.customer_id ?? null,
    status: mapRazorpayStatus(sub.status, cancelAtPeriodEnd),
    providerStatus: sub.status,
    providerPriceId: sub.plan_id,
    currentPeriodStart: isoFromUnix(sub.current_start),
    currentPeriodEnd: isoFromUnix(sub.current_end),
    cancelAtPeriodEnd,
    cancelledAt: sub.status === "cancelled" ? isoFromUnix(sub.ended_at) : null,
    trialStart: null,
    trialEnd: null,
    metadata: notesOf(sub.notes),
  };
}

const PAYMENT_STATUS: Record<string, PaymentStatus> = {
  created: "pending",
  authorized: "pending",
  captured: "succeeded",
  refunded: "refunded",
  failed: "failed",
};

export function toProviderPayment(payment: RazorpayPayment, subscriptionId: string | null = null): ProviderPayment {
  const currency = payment.currency.toUpperCase();
  const amount = fromMinorUnits(payment.amount, currency) ?? 0;
  const refunded = fromMinorUnits(payment.amount_refunded ?? 0, currency) ?? 0;
  const base = PAYMENT_STATUS[payment.status] ?? "pending";
  const status: PaymentStatus = refunded > 0 ? (refunded >= amount ? "refunded" : "partially_refunded") : base;
  const failed = base === "failed";
  return {
    id: payment.id,
    invoiceId: payment.invoice_id ?? null,
    orderId: payment.order_id ?? null,
    invoiceNumber: null,
    subscriptionId: payment.subscription_id ?? subscriptionId,
    amount,
    taxAmount: fromMinorUnits(payment.tax ?? null, currency),
    currency,
    status,
    methodType: payment.method ?? null,
    paidAt: base === "succeeded" ? isoFromUnix(payment.created_at) : null,
    failedAt: failed ? isoFromUnix(payment.created_at) ?? new Date().toISOString() : null,
    failureCode: failed ? (payment.error_code ?? "payment_failed") : null,
    // Razorpay's error descriptions are customer-facing text ("Your payment could not be
    // completed..."), never credentials; still bounded.
    failureMessage: failed ? (payment.error_description ?? "The payment could not be completed.").slice(0, 300) : null,
    refundedAmount: refunded,
  };
}

/** HMAC-SHA256 hex of the raw body with the webhook secret, compared in constant time. */
export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): void {
  if (!signature) throw new WebhookVerificationError("Missing X-Razorpay-Signature header.");
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new WebhookVerificationError();
}

export function parseRazorpayEvent(rawBody: string, eventIdHeader: string | null): ProviderWebhookEvent {
  const event = JSON.parse(rawBody) as {
    event?: string;
    created_at?: number;
    payload?: {
      subscription?: { entity?: RazorpaySubscription };
      payment?: { entity?: RazorpayPayment };
      refund?: { entity?: { payment_id?: string } };
    };
  };
  if (!event?.event) throw new WebhookVerificationError("Malformed Razorpay event.");
  // Razorpay sends a unique id per event in this header; the body alone has none. A body
  // hash is the fallback so a redelivery still dedupes.
  const id = eventIdHeader || `body_${createHash("sha256").update(rawBody).digest("hex")}`;
  const base = { id, type: event.event, occurredAt: isoFromUnix(event.created_at) };
  const sub = event.payload?.subscription?.entity;
  const payment = event.payload?.payment?.entity;

  if (event.event.startsWith("subscription.") && sub) {
    return {
      ...base,
      kind: "subscription",
      subscription: toProviderSubscription(sub),
      payment: payment ? toProviderPayment(payment, sub.id) : undefined,
      subscriptionIdToRefresh: sub.id,
    };
  }
  if ((event.event === "payment.failed" || event.event === "payment.captured") && payment) {
    return { ...base, kind: "payment", payment: toProviderPayment(payment), subscriptionIdToRefresh: payment.subscription_id ?? null };
  }
  if (event.event.startsWith("refund.") && event.payload?.refund?.entity?.payment_id) {
    return { ...base, kind: "payment", paymentIdToRefresh: event.payload.refund.entity.payment_id };
  }
  if (event.event === "payment.dispute.created" && payment) {
    return { ...base, kind: "payment", payment: { ...toProviderPayment(payment), status: "disputed" } };
  }
  return { ...base, kind: "unhandled" };
}

export function createRazorpayProvider(config: ProviderConfig): BillingProvider {
  const call = <T>(operation: string, path: string, method: "GET" | "POST" | "PATCH", body?: unknown) => {
    if (!config.publicKey || !config.secretKey) {
      throw new BillingProviderError("razorpay", operation, "not_configured", "Razorpay isn't configured.");
    }
    return providerRequest<T>("razorpay", operation, `${API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64")}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  return {
    key: "razorpay",

    async createCustomer({ businessId, name, email }) {
      // fail_existing "0" returns the existing customer for the same email instead of an error.
      const customer = await call<{ id: string }>("create_customer", "/customers", "POST", {
        name: name.slice(0, 50),
        email: email ?? undefined,
        fail_existing: "0",
        notes: { business_id: businessId },
      });
      return { id: customer.id };
    },

    async createCheckout(input: CreateCheckoutInput) {
      const sub = await call<RazorpaySubscription>("create_checkout", "/subscriptions", "POST", {
        plan_id: input.providerPriceId,
        customer_id: input.customerId,
        total_count: TOTAL_COUNT[input.billingInterval],
        customer_notify: 1,
        notes: { business_id: input.businessId, checkout_session_id: input.sessionId, plan_key: input.planKey },
      });
      return { checkoutId: sub.id, subscriptionId: sub.id, redirectUrl: sub.short_url ?? null };
    },

    async getSubscription(subscriptionId) {
      return toProviderSubscription(await call<RazorpaySubscription>("get_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "GET"));
    },

    async cancelSubscription(subscriptionId, { atPeriodEnd }) {
      const sub = await call<RazorpaySubscription>("cancel_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, "POST", {
        cancel_at_cycle_end: atPeriodEnd ? 1 : 0,
      });
      return toProviderSubscription(sub, atPeriodEnd && sub.status !== "cancelled");
    },

    async resumeSubscription(subscriptionId) {
      const current = await call<RazorpaySubscription>("get_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "GET");
      if (current.status !== "paused") {
        throw new BillingProviderError(
          "razorpay",
          "resume_subscription",
          "unsupported",
          "Razorpay can't undo a cancellation scheduled for the end of the billing cycle. Subscribe again once it ends.",
        );
      }
      return toProviderSubscription(
        await call<RazorpaySubscription>("resume_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}/resume`, "POST", { resume_at: "now" }),
      );
    },

    async changeSubscription(subscriptionId, { providerPriceId, timing }) {
      // Razorpay applies its own proration rules to an immediate change; there is no switch.
      return toProviderSubscription(
        await call<RazorpaySubscription>("change_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "PATCH", {
          plan_id: providerPriceId,
          schedule_change_at: timing === "immediate" ? "now" : "cycle_end",
          customer_notify: 1,
        }),
      );
    },

    async createPortalSession({ subscriptionId }) {
      // No customer portal: the subscription's own hosted link is where a customer
      // re-authorises or changes the payment method.
      if (!subscriptionId) return null;
      const sub = await call<RazorpaySubscription>("get_subscription", `/subscriptions/${encodeURIComponent(subscriptionId)}`, "GET");
      return sub.short_url ? { url: sub.short_url } : null;
    },

    async getPayment(paymentId) {
      return toProviderPayment(await call<RazorpayPayment>("get_payment", `/payments/${encodeURIComponent(paymentId)}`, "GET"));
    },

    async refundPayment(paymentId, { amount, reason }) {
      const payment = await this.getPayment(paymentId);
      const refund = await call<{ id: string; status: string }>("refund_payment", `/payments/${encodeURIComponent(paymentId)}/refund`, "POST", {
        amount: amount == null ? undefined : toMinorUnits(amount, payment.currency),
        notes: { reason: reason.slice(0, 250) },
      });
      return { refundId: refund.id, status: refund.status };
    },

    verifyWebhook(rawBody, headers) {
      if (!config.webhookSecret) throw new WebhookVerificationError("Razorpay webhook secret isn't configured.");
      verifyRazorpaySignature(rawBody, headers.get("x-razorpay-signature"), config.webhookSecret);
      return parseRazorpayEvent(rawBody, headers.get("x-razorpay-event-id"));
    },
  };
}
