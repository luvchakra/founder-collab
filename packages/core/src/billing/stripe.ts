import { createHmac, timingSafeEqual } from "node:crypto";
import { gatewayRequest } from "./http";
import { mapSubscriptionStatus } from "./status";
import type { NormalizedGatewayEvent } from "./types";

/**
 * Stripe over its REST API with plain fetch -- no SDK (CLAUDE.md principle 2), same as
 * the Resend webhook's hand-rolled Svix verification. Only the handful of endpoints the
 * platform uses: Checkout Sessions (subscription + one-off payment), subscription
 * cancel, and webhook verification.
 */
const API_BASE = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Stripe's API takes application/x-www-form-urlencoded with bracketed nesting:
 * {line_items: [{price: "p"}]} -> line_items[0][price]=p. */
export function toStripeForm(input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const walk = (value: unknown, key: string) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${key}[${i}]`));
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${key}[${k}]`);
    } else {
      params.append(key, String(value));
    }
  };
  for (const [k, v] of Object.entries(input)) walk(v, k);
  return params.toString();
}

async function stripePost<T>(secretKey: string, path: string, body: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  return gatewayRequest<T>("stripe", `${API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: toStripeForm(body),
  });
}

/**
 * Verifies a Stripe-Signature header (`t=<unix>,v1=<hex>[,v1=<hex>...]`): HMAC-SHA256 of
 * `${t}.${rawBody}` keyed by the endpoint secret (the whsec_... string, used as-is), and
 * the timestamp within 5 minutes of now -- the replay protection.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;
  let timestamp: string | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v ?? null;
    if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false;
    const provided = Buffer.from(sig, "hex");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

type StripeObject = Record<string, unknown> & { id?: string; metadata?: Record<string, string> };
type StripeEvent = { id: string; type: string; created: number; data: { object: StripeObject } };

function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

/** Reduces a verified Stripe event to what the platform acts on. Handles both the
 * pre- and post-2025-03-31 ("basil") subscription shapes: current_period_end moved
 * from the subscription onto its items. */
export function parseStripeEvent(raw: unknown): NormalizedGatewayEvent {
  const event = raw as StripeEvent;
  const occurredAt = new Date((event.created ?? 0) * 1000);
  const base = { provider: "stripe" as const, eventId: event.id, eventType: event.type, occurredAt };
  const object = event.data?.object ?? {};

  if (event.type.startsWith("customer.subscription.")) {
    const items = (object.items as { data?: { current_period_end?: number }[] } | undefined)?.data;
    const periodEnd = (object.current_period_end as number | undefined) ?? items?.[0]?.current_period_end;
    return {
      ...base,
      kind: "subscription",
      subscriptionId: String(object.id),
      customerId: idOf(object.customer),
      status: mapSubscriptionStatus("stripe", String(object.status ?? "")),
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      metadata: object.metadata ?? {},
    };
  }

  // One-off collections: Checkout in payment mode. async_payment_succeeded covers
  // delayed methods (bank debits) whose completed event arrives with payment_status
  // "unpaid".
  if (
    (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") &&
    object.mode === "payment" &&
    object.payment_status === "paid"
  ) {
    return {
      ...base,
      kind: "payment_succeeded",
      paymentId: idOf(object.payment_intent) ?? String(object.id),
      amountMinor: Number(object.amount_total ?? 0),
      currency: String(object.currency ?? "").toUpperCase(),
      reference: String(object.id),
      metadata: object.metadata ?? {},
    };
  }

  return { ...base, kind: "ignored" };
}

/** Hosted Checkout for a module subscription. business_id/module_key ride along on the
 * subscription's own metadata, so every later customer.subscription.* event carries them. */
export async function createStripeSubscriptionCheckout(input: {
  secretKey: string;
  priceId: string;
  businessId: string;
  moduleKey: string;
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}): Promise<{ id: string; url: string }> {
  const metadata = { business_id: input.businessId, module_key: input.moduleKey };
  const session = await stripePost<{ id: string; url: string | null }>(
    input.secretKey,
    "/checkout/sessions",
    {
      mode: "subscription",
      line_items: [{ price: input.priceId, quantity: 1 }],
      client_reference_id: input.businessId,
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata,
      subscription_data: { metadata },
    },
    input.idempotencyKey,
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { id: session.id, url: session.url };
}

/** Hosted Checkout for collecting one invoice's balance from a business's customer. */
export async function createStripePaymentCheckout(input: {
  secretKey: string;
  amountMinor: number;
  currency: string;
  description: string;
  customerEmail: string | null;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}): Promise<{ id: string; url: string }> {
  const session = await stripePost<{ id: string; url: string | null }>(
    input.secretKey,
    "/checkout/sessions",
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: { name: input.description },
          },
        },
      ],
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: input.metadata,
      payment_intent_data: { metadata: input.metadata },
    },
    input.idempotencyKey,
  );
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { id: session.id, url: session.url };
}

/** Cancel at period end (the customer keeps what they paid for); the resulting
 * customer.subscription.updated/deleted webhooks drive the license change. */
export async function cancelStripeSubscription(secretKey: string, subscriptionId: string): Promise<void> {
  await stripePost(secretKey, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    cancel_at_period_end: true,
  });
}
