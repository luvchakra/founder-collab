import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStripeProvider, encodeForm, parseStripeEvent, verifyStripeSignature } from "./stripe";
import { BillingProviderError, WebhookVerificationError, type ProviderConfig } from "../subscription-types";

const SECRET = "whsec_test_secret";
const sign = (body: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

const config: ProviderConfig = {
  provider: "stripe",
  environment: "test",
  enabled: true,
  priority: 20,
  supportedCurrencies: ["USD"],
  supportedCountries: [],
  publicKey: "pk_test_x",
  secretKey: "sk_test_x",
  webhookSecret: SECRET,
  source: "platform",
};

afterEach(() => vi.unstubAllGlobals());

describe("BILL-05 Stripe webhook signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const now = 1_800_000_000;

  it("accepts a valid signature inside the window", () => {
    expect(() => verifyStripeSignature(body, sign(body, now), SECRET, now + 10)).not.toThrow();
  });

  it("rejects a missing header, a wrong secret, a tampered body and a stale timestamp", () => {
    expect(() => verifyStripeSignature(body, null, SECRET, now)).toThrow(WebhookVerificationError);
    expect(() => verifyStripeSignature(body, sign(body, now, "whsec_other"), SECRET, now)).toThrow(WebhookVerificationError);
    expect(() => verifyStripeSignature(`${body} `, sign(body, now), SECRET, now)).toThrow(WebhookVerificationError);
    expect(() => verifyStripeSignature(body, sign(body, now), SECRET, now + 301)).toThrow(/Stale/);
    expect(() => verifyStripeSignature(body, "garbage", SECRET, now)).toThrow(/Malformed/);
  });

  it("accepts any one matching v1 among several (secret rotation)", () => {
    const header = `t=${now},v1=deadbeef,${sign(body, now).split(",")[1]}`;
    expect(() => verifyStripeSignature(body, header, SECRET, now)).not.toThrow();
  });
});

describe("BILL-05 Stripe event parsing", () => {
  it("normalizes checkout.session.completed with the echoed checkout session id", () => {
    const e = parseStripeEvent(
      JSON.stringify({
        id: "evt_c",
        type: "checkout.session.completed",
        created: 1_800_000_000,
        data: { object: { id: "cs_1", subscription: "sub_1", customer: "cus_1", client_reference_id: "sess-uuid" } },
      }),
    );
    expect(e.kind).toBe("checkout");
    expect(e.checkout).toEqual({ checkoutId: "cs_1", subscriptionId: "sub_1", customerId: "cus_1", clientReference: "sess-uuid" });
    expect(e.subscriptionIdToRefresh).toBe("sub_1");
  });

  it("reads period dates from the item when the subscription lacks them", () => {
    const e = parseStripeEvent(
      JSON.stringify({
        id: "evt_s",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1",
            customer: "cus_1",
            status: "active",
            cancel_at_period_end: true,
            metadata: { business_id: "b1" },
            items: { data: [{ id: "si_1", price: { id: "price_1" }, current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 }] },
          },
        },
      }),
    );
    expect(e.subscription?.status).toBe("cancel_scheduled");
    expect(e.subscription?.providerPriceId).toBe("price_1");
    expect(e.subscription?.currentPeriodEnd).toBe(new Date(1_802_592_000_000).toISOString());
    expect(e.subscription?.metadata.business_id).toBe("b1");
  });

  it("turns a paid invoice into a succeeded payment in major units", () => {
    const e = parseStripeEvent(
      JSON.stringify({
        id: "evt_i",
        type: "invoice.paid",
        data: { object: { id: "in_1", number: "INV-1", subscription: "sub_1", amount_paid: 2999, currency: "usd", payment_intent: "pi_1", tax: 300 } },
      }),
    );
    expect(e.kind).toBe("payment");
    expect(e.payment).toMatchObject({ id: "pi_1", invoiceId: "in_1", amount: 29.99, taxAmount: 3, currency: "USD", status: "succeeded", subscriptionId: "sub_1" });
    expect(e.subscriptionIdToRefresh).toBe("sub_1");
  });

  it("gives a failed invoice a safe customer message, not the provider payload", () => {
    const e = parseStripeEvent(
      JSON.stringify({ id: "evt_f", type: "invoice.payment_failed", data: { object: { id: "in_2", amount_due: 5000, currency: "usd", subscription: "sub_1" } } }),
    );
    expect(e.payment?.status).toBe("failed");
    expect(e.payment?.failureMessage).toBe("The payment could not be completed.");
  });

  it("distinguishes partial and full refunds", () => {
    const partial = parseStripeEvent(
      JSON.stringify({ id: "e1", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 1000, amount_refunded: 400, currency: "usd" } } }),
    );
    expect(partial.payment).toMatchObject({ id: "pi_1", status: "partially_refunded", refundedAmount: 4 });
    const full = parseStripeEvent(
      JSON.stringify({ id: "e2", type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 1000, amount_refunded: 1000, currency: "usd" } } }),
    );
    expect(full.payment?.status).toBe("refunded");
  });

  it("acknowledges events it doesn't act on as unhandled", () => {
    expect(parseStripeEvent(JSON.stringify({ id: "e", type: "customer.created", data: { object: {} } })).kind).toBe("unhandled");
  });
});

describe("BILL-05 Stripe adapter", () => {
  it("encodes nested form bodies the way Stripe expects", () => {
    expect(decodeURIComponent(encodeForm({ a: 1, b: { c: "x" }, items: [{ price: "p", quantity: 1 }], skip: undefined }))).toBe(
      "a=1&b[c]=x&items[0][price]=p&items[0][quantity]=1",
    );
  });

  it("creates a subscription-mode checkout with the session id echoed and an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createStripeProvider(config).createCheckout({
      customerId: "cus_1",
      providerPriceId: "price_1",
      sessionId: "sess-1",
      businessId: "biz-1",
      planKey: "pro",
      billingInterval: "month",
      customerEmail: null,
      successUrl: "https://app/success",
      cancelUrl: "https://app/cancel",
      idempotencyKey: "idem-1",
    });
    expect(result).toEqual({ checkoutId: "cs_1", subscriptionId: null, redirectUrl: "https://checkout.stripe.com/c/1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers["Idempotency-Key"]).toBe("idem-1");
    const body = decodeURIComponent(init.body as string);
    expect(body).toContain("mode=subscription");
    expect(body).toContain("client_reference_id=sess-1");
    expect(body).toContain("subscription_data[metadata][business_id]=biz-1");
  });

  it("changes price without proration for a next-renewal change", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sub_1", status: "active", customer: "cus_1", items: { data: [{ id: "si_1", price: { id: "price_1" } }] } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "sub_1", status: "active", customer: "cus_1", items: { data: [{ id: "si_1", price: { id: "price_2" } }] } })));
    vi.stubGlobal("fetch", fetchMock);
    const sub = await createStripeProvider(config).changeSubscription("sub_1", { providerPriceId: "price_2", timing: "next_renewal", prorate: true });
    expect(sub.providerPriceId).toBe("price_2");
    expect(decodeURIComponent(fetchMock.mock.calls[1]![1].body)).toContain("proration_behavior=none");
  });

  it("surfaces provider errors without echoing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "resource_missing", message: "No such price" } }), { status: 400 })),
    );
    const err = await createStripeProvider(config).getSubscription("sub_x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BillingProviderError);
    expect((err as BillingProviderError).code).toBe("resource_missing");
    expect(String((err as Error).message)).not.toContain("sk_test_x");
  });

  it("refuses to call Stripe with no secret key", async () => {
    await expect(createStripeProvider({ ...config, secretKey: null }).getSubscription("sub_1")).rejects.toThrow(/isn't configured/);
  });

  it("verifyWebhook fails closed when no webhook secret is configured", () => {
    expect(() => createStripeProvider({ ...config, webhookSecret: null }).verifyWebhook("{}", new Headers())).toThrow(WebhookVerificationError);
  });
});
