import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRazorpayProvider, parseRazorpayEvent, toProviderPayment, verifyRazorpaySignature } from "./razorpay";
import { BillingProviderError, WebhookVerificationError, type ProviderConfig } from "../subscription-types";

const SECRET = "rzp_webhook_secret";
const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body).digest("hex");

const config: ProviderConfig = {
  provider: "razorpay",
  environment: "test",
  enabled: true,
  priority: 10,
  supportedCurrencies: ["INR"],
  supportedCountries: [],
  publicKey: "rzp_test_key",
  secretKey: "rzp_secret",
  webhookSecret: SECRET,
  source: "platform",
};

afterEach(() => vi.unstubAllGlobals());

describe("BILL-04 Razorpay webhook signature", () => {
  const body = JSON.stringify({ event: "subscription.charged" });
  it("accepts the HMAC of the raw body", () => {
    expect(() => verifyRazorpaySignature(body, sign(body), SECRET)).not.toThrow();
  });
  it("rejects a missing, wrong or tampered signature", () => {
    expect(() => verifyRazorpaySignature(body, null, SECRET)).toThrow(WebhookVerificationError);
    expect(() => verifyRazorpaySignature(body, sign(body, "other"), SECRET)).toThrow(WebhookVerificationError);
    expect(() => verifyRazorpaySignature(`${body} `, sign(body), SECRET)).toThrow(WebhookVerificationError);
    expect(() => verifyRazorpaySignature(body, "short", SECRET)).toThrow(WebhookVerificationError);
  });
});

describe("BILL-04 Razorpay event parsing", () => {
  const charged = {
    event: "subscription.charged",
    created_at: 1_800_000_000,
    payload: {
      subscription: { entity: { id: "sub_1", plan_id: "plan_1", customer_id: "cust_1", status: "active", current_start: 1_800_000_000, current_end: 1_802_592_000, notes: { business_id: "b1" } } },
      payment: { entity: { id: "pay_1", amount: 299900, currency: "INR", status: "captured", method: "upi", created_at: 1_800_000_000 } },
    },
  };

  it("carries the subscription and its payment, keyed by the event-id header", () => {
    const e = parseRazorpayEvent(JSON.stringify(charged), "evt_hdr");
    expect(e.id).toBe("evt_hdr");
    expect(e.kind).toBe("subscription");
    expect(e.subscription).toMatchObject({ id: "sub_1", status: "active", providerPriceId: "plan_1", metadata: { business_id: "b1" } });
    expect(e.payment).toMatchObject({ id: "pay_1", amount: 2999, currency: "INR", status: "succeeded", subscriptionId: "sub_1", methodType: "upi" });
  });

  it("falls back to a body hash so a redelivery without the header still dedupes", () => {
    const a = parseRazorpayEvent(JSON.stringify(charged), null);
    const b = parseRazorpayEvent(JSON.stringify(charged), null);
    expect(a.id).toMatch(/^body_[0-9a-f]{64}$/);
    expect(a.id).toBe(b.id);
  });

  it("treats Razorpay's empty-array notes as no notes", () => {
    const e = parseRazorpayEvent(
      JSON.stringify({ event: "subscription.halted", payload: { subscription: { entity: { id: "s", plan_id: "p", status: "halted", notes: [] } } } }),
      "e",
    );
    expect(e.subscription?.metadata).toEqual({});
    expect(e.subscription?.status).toBe("unpaid");
  });

  it("maps a failed payment with a bounded customer message", () => {
    const e = parseRazorpayEvent(
      JSON.stringify({
        event: "payment.failed",
        payload: { payment: { entity: { id: "pay_2", amount: 100, currency: "INR", status: "failed", error_code: "BAD_REQUEST_ERROR", error_description: "x".repeat(500), subscription_id: "sub_1" } } },
      }),
      "e",
    );
    expect(e.payment?.status).toBe("failed");
    expect(e.payment?.failureMessage).toHaveLength(300);
    expect(e.subscriptionIdToRefresh).toBe("sub_1");
  });

  it("asks for the payment to be re-fetched on a refund event", () => {
    const e = parseRazorpayEvent(JSON.stringify({ event: "refund.processed", payload: { refund: { entity: { payment_id: "pay_1" } } } }), "e");
    expect(e.paymentIdToRefresh).toBe("pay_1");
  });

  it("maps partial refunds from amount_refunded", () => {
    expect(toProviderPayment({ id: "p", amount: 1000, currency: "INR", status: "captured", amount_refunded: 300 }).status).toBe("partially_refunded");
    expect(toProviderPayment({ id: "p", amount: 1000, currency: "INR", status: "refunded", amount_refunded: 1000 }).status).toBe("refunded");
  });

  it("acknowledges unrelated events as unhandled and rejects malformed ones", () => {
    expect(parseRazorpayEvent(JSON.stringify({ event: "order.paid", payload: {} }), "e").kind).toBe("unhandled");
    expect(() => parseRazorpayEvent(JSON.stringify({}), "e")).toThrow(WebhookVerificationError);
  });
});

describe("BILL-04 Razorpay adapter", () => {
  it("creates a subscription with the checkout session in its notes and a finite total_count", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "sub_1", plan_id: "plan_1", status: "created", short_url: "https://rzp.io/i/x" })));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createRazorpayProvider(config).createCheckout({
      customerId: "cust_1",
      providerPriceId: "plan_1",
      sessionId: "sess-1",
      businessId: "biz-1",
      planKey: "pro",
      billingInterval: "year",
      customerEmail: null,
      successUrl: "",
      cancelUrl: "",
      idempotencyKey: "k",
    });
    expect(result).toEqual({ checkoutId: "sub_1", subscriptionId: "sub_1", redirectUrl: "https://rzp.io/i/x" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/subscriptions");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("rzp_test_key:rzp_secret").toString("base64")}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ plan_id: "plan_1", customer_id: "cust_1", total_count: 10, notes: { business_id: "biz-1", checkout_session_id: "sess-1" } });
  });

  it("cancels at cycle end and reports cancel_scheduled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "sub_1", plan_id: "p", status: "active" }))));
    const sub = await createRazorpayProvider(config).cancelSubscription("sub_1", { atPeriodEnd: true });
    expect(sub.status).toBe("cancel_scheduled");
    expect(sub.cancelAtPeriodEnd).toBe(true);
  });

  it("says plainly that a scheduled cancellation can't be undone", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "sub_1", plan_id: "p", status: "active" }))));
    const err = await createRazorpayProvider(config).resumeSubscription("sub_1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).code).toBe("unsupported");
  });

  it("verifies the webhook before parsing it", () => {
    const provider = createRazorpayProvider(config);
    const body = JSON.stringify({ event: "order.paid", payload: {} });
    expect(() => provider.verifyWebhook(body, new Headers({ "x-razorpay-signature": "bad" }))).toThrow(WebhookVerificationError);
    const ok = provider.verifyWebhook(body, new Headers({ "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_9" }));
    expect(ok.id).toBe("evt_9");
  });
});
