import { createHmac, timingSafeEqual } from "node:crypto";
import { gatewayRequest } from "./http";
import { mapSubscriptionStatus } from "./status";
import type { NormalizedGatewayEvent } from "./types";

/**
 * Razorpay over its REST API with plain fetch -- no SDK (CLAUDE.md principle 2). Used for
 * INR billing (UPI, cards, netbanking, UPI Autopay mandates for subscriptions):
 * Subscriptions for module licenses, Payment Links for invoice collection.
 */
const API_BASE = "https://api.razorpay.com/v1";

function authHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

async function razorpayPost<T>(keyId: string, keySecret: string, path: string, body: Record<string, unknown>): Promise<T> {
  return gatewayRequest<T>("razorpay", `${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: authHeader(keyId, keySecret), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * X-Razorpay-Signature is hex HMAC-SHA256 of the raw request body keyed by the webhook
 * secret. https://razorpay.com/docs/webhooks/validate-test/
 * Razorpay signs no timestamp, so replay protection comes from the event-id dedupe in
 * core.payment_gateway_events instead.
 */
export function verifyRazorpaySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret || !/^[0-9a-f]+$/i.test(header)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const provided = Buffer.from(header, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

type RazorpayEntity = Record<string, unknown> & { id?: string; notes?: Record<string, string> | unknown[] };
type RazorpayEvent = {
  event: string;
  created_at: number;
  payload: Record<string, { entity: RazorpayEntity } | undefined>;
};

/** Razorpay serializes empty notes as [] rather than {}. */
function notesOf(entity: RazorpayEntity | undefined): Record<string, string> {
  const notes = entity?.notes;
  return notes && !Array.isArray(notes) ? (notes as Record<string, string>) : {};
}

/**
 * Reduces a verified Razorpay event. `eventId` is the x-razorpay-event-id header --
 * Razorpay's documented idempotency key (the body carries none).
 */
export function parseRazorpayEvent(raw: unknown, eventId: string): NormalizedGatewayEvent {
  const event = raw as RazorpayEvent;
  const occurredAt = new Date((event.created_at ?? 0) * 1000);
  const base = { provider: "razorpay" as const, eventId, eventType: event.event, occurredAt };

  if (event.event.startsWith("subscription.")) {
    const sub = event.payload.subscription?.entity ?? {};
    const currentEnd = sub.current_end as number | null | undefined;
    return {
      ...base,
      kind: "subscription",
      subscriptionId: String(sub.id),
      customerId: typeof sub.customer_id === "string" ? sub.customer_id : null,
      status: mapSubscriptionStatus("razorpay", String(sub.status ?? "")),
      currentPeriodEnd: currentEnd ? new Date(currentEnd * 1000) : null,
      // Razorpay has no separate flag: a cancel-at-cycle-end request leaves the
      // subscription active with has_scheduled_changes / end_at set.
      cancelAtPeriodEnd: sub.has_scheduled_changes === true,
      metadata: notesOf(sub),
    };
  }

  if (event.event === "payment_link.paid") {
    const link = event.payload.payment_link?.entity ?? {};
    const payment = event.payload.payment?.entity ?? {};
    return {
      ...base,
      kind: "payment_succeeded",
      paymentId: String(payment.id),
      amountMinor: Number(payment.amount ?? 0),
      currency: String(payment.currency ?? "").toUpperCase(),
      reference: String(link.id),
      metadata: { ...notesOf(link), ...(typeof link.reference_id === "string" ? { reference_id: link.reference_id } : {}) },
    };
  }

  return { ...base, kind: "ignored" };
}

/** Creates a subscription against a plan; the customer authorizes the mandate (UPI
 * Autopay / card / eMandate) on Razorpay's hosted short_url. total_count is required by
 * Razorpay -- 10 years of cycles, i.e. "until cancelled" in practice. */
export async function createRazorpaySubscription(input: {
  keyId: string;
  keySecret: string;
  planId: string;
  billingInterval: "month" | "year";
  businessId: string;
  moduleKey: string;
}): Promise<{ id: string; shortUrl: string; status: string }> {
  const sub = await razorpayPost<{ id: string; short_url: string; status: string }>(
    input.keyId,
    input.keySecret,
    "/subscriptions",
    {
      plan_id: input.planId,
      total_count: input.billingInterval === "year" ? 10 : 120,
      customer_notify: 1,
      notes: { business_id: input.businessId, module_key: input.moduleKey },
    },
  );
  return { id: sub.id, shortUrl: sub.short_url, status: sub.status };
}

/** Cancel at the end of the current billing cycle. */
export async function cancelRazorpaySubscription(keyId: string, keySecret: string, subscriptionId: string): Promise<void> {
  await razorpayPost(keyId, keySecret, `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    cancel_at_cycle_end: 1,
  });
}

/** A hosted payment link for one invoice's balance. reference_id is our
 * payment_request id (Razorpay enforces its uniqueness per account, which also makes a
 * retried create safe). */
export async function createRazorpayPaymentLink(input: {
  keyId: string;
  keySecret: string;
  amountMinor: number;
  currency: string;
  description: string;
  referenceId: string;
  customer: { name?: string; email?: string; contact?: string };
  notes: Record<string, string>;
  callbackUrl: string;
}): Promise<{ id: string; shortUrl: string }> {
  const link = await razorpayPost<{ id: string; short_url: string }>(input.keyId, input.keySecret, "/payment_links", {
    amount: input.amountMinor,
    currency: input.currency,
    description: input.description.slice(0, 2048),
    reference_id: input.referenceId,
    customer: input.customer,
    notify: { email: Boolean(input.customer.email), sms: Boolean(input.customer.contact) },
    reminder_enable: true,
    notes: input.notes,
    callback_url: input.callbackUrl,
    callback_method: "get",
  });
  return { id: link.id, shortUrl: link.short_url };
}
