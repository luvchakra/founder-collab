import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseStripeEvent, toStripeForm, verifyStripeSignature } from "./stripe";
import { parseRazorpayEvent, verifyRazorpaySignature } from "./razorpay";
import { fromMinorUnits, licenseEffect, mapSubscriptionStatus, toMinorUnits } from "./status";

const STRIPE_SECRET = "whsec_test_secret";

function stripeHeader(body: string, t: number, secret = STRIPE_SECRET) {
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

describe("verifyStripeSignature", () => {
  const body = JSON.stringify({ id: "evt_1" });
  const now = 1_760_000_000;

  it("accepts a correctly signed, fresh payload", () => {
    expect(verifyStripeSignature(body, stripeHeader(body, now), STRIPE_SECRET, now)).toBe(true);
  });

  it("accepts when any one of several v1 signatures matches (secret rotation)", () => {
    const good = stripeHeader(body, now).split(",")[1];
    expect(verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},${good}`, STRIPE_SECRET, now)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, or missing header", () => {
    expect(verifyStripeSignature(body + " ", stripeHeader(body, now), STRIPE_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, stripeHeader(body, now, "whsec_other"), STRIPE_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, null, STRIPE_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", STRIPE_SECRET, now)).toBe(false);
  });

  it("rejects a replayed payload older than the 5-minute tolerance", () => {
    expect(verifyStripeSignature(body, stripeHeader(body, now - 301), STRIPE_SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, stripeHeader(body, now - 299), STRIPE_SECRET, now)).toBe(true);
  });
});

describe("parseStripeEvent", () => {
  it("normalizes a subscription event (legacy top-level current_period_end)", () => {
    const event = parseStripeEvent({
      id: "evt_1",
      type: "customer.subscription.updated",
      created: 1_760_000_000,
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "trialing",
          cancel_at_period_end: true,
          current_period_end: 1_762_000_000,
          metadata: { business_id: "b1", module_key: "fsm" },
        },
      },
    });
    expect(event).toMatchObject({
      kind: "subscription",
      subscriptionId: "sub_1",
      customerId: "cus_1",
      status: "active",
      cancelAtPeriodEnd: true,
      metadata: { business_id: "b1", module_key: "fsm" },
    });
    expect(event.kind === "subscription" && event.currentPeriodEnd?.getTime()).toBe(1_762_000_000_000);
  });

  it("reads current_period_end from items on newer API versions", () => {
    const event = parseStripeEvent({
      id: "evt_2",
      type: "customer.subscription.deleted",
      created: 1,
      data: { object: { id: "sub_2", status: "canceled", items: { data: [{ current_period_end: 5 }] } } },
    });
    expect(event).toMatchObject({ kind: "subscription", status: "cancelled" });
    expect(event.kind === "subscription" && event.currentPeriodEnd?.getTime()).toBe(5000);
  });

  it("normalizes a paid payment-mode checkout", () => {
    const event = parseStripeEvent({
      id: "evt_3",
      type: "checkout.session.completed",
      created: 1,
      data: {
        object: {
          id: "cs_1",
          mode: "payment",
          payment_status: "paid",
          payment_intent: "pi_1",
          amount_total: 150000,
          currency: "inr",
          metadata: { payment_request_id: "r1" },
        },
      },
    });
    expect(event).toMatchObject({
      kind: "payment_succeeded",
      paymentId: "pi_1",
      amountMinor: 150000,
      currency: "INR",
      reference: "cs_1",
    });
  });

  it("ignores unpaid checkouts, subscription-mode checkouts and unrelated events", () => {
    const unpaid = { id: "e", type: "checkout.session.completed", created: 1, data: { object: { mode: "payment", payment_status: "unpaid" } } };
    const subMode = { id: "e", type: "checkout.session.completed", created: 1, data: { object: { mode: "subscription", payment_status: "paid" } } };
    const other = { id: "e", type: "invoice.created", created: 1, data: { object: {} } };
    expect(parseStripeEvent(unpaid).kind).toBe("ignored");
    expect(parseStripeEvent(subMode).kind).toBe("ignored");
    expect(parseStripeEvent(other).kind).toBe("ignored");
  });
});

describe("toStripeForm", () => {
  it("flattens nested objects and arrays with bracket notation", () => {
    const form = new URLSearchParams(
      toStripeForm({ mode: "subscription", line_items: [{ price: "p_1", quantity: 1 }], metadata: { a: "b" }, skip: undefined }),
    );
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price]")).toBe("p_1");
    expect(form.get("line_items[0][quantity]")).toBe("1");
    expect(form.get("metadata[a]")).toBe("b");
    expect(form.has("skip")).toBe(false);
  });
});

describe("verifyRazorpaySignature", () => {
  const body = JSON.stringify({ event: "subscription.activated" });
  const sig = createHmac("sha256", "rzp_secret").update(body).digest("hex");
  it("accepts the right signature and rejects anything else", () => {
    expect(verifyRazorpaySignature(body, sig, "rzp_secret")).toBe(true);
    expect(verifyRazorpaySignature(body + "x", sig, "rzp_secret")).toBe(false);
    expect(verifyRazorpaySignature(body, sig, "other")).toBe(false);
    expect(verifyRazorpaySignature(body, null, "rzp_secret")).toBe(false);
    expect(verifyRazorpaySignature(body, "not-hex!", "rzp_secret")).toBe(false);
  });
});

describe("parseRazorpayEvent", () => {
  it("normalizes a subscription event, including notes as metadata", () => {
    const event = parseRazorpayEvent(
      {
        event: "subscription.charged",
        created_at: 1_760_000_000,
        payload: {
          subscription: {
            entity: {
              id: "sub_R1",
              customer_id: "cust_1",
              status: "active",
              current_end: 1_762_000_000,
              has_scheduled_changes: false,
              notes: { business_id: "b1", module_key: "inventory" },
            },
          },
        },
      },
      "evt_header_1",
    );
    expect(event).toMatchObject({
      kind: "subscription",
      eventId: "evt_header_1",
      subscriptionId: "sub_R1",
      status: "active",
      metadata: { business_id: "b1", module_key: "inventory" },
    });
  });

  it("treats Razorpay's empty-notes [] as no metadata", () => {
    const event = parseRazorpayEvent(
      { event: "subscription.halted", created_at: 1, payload: { subscription: { entity: { id: "s", status: "halted", notes: [] } } } },
      "e",
    );
    expect(event).toMatchObject({ kind: "subscription", status: "halted", metadata: {} });
  });

  it("normalizes payment_link.paid", () => {
    const event = parseRazorpayEvent(
      {
        event: "payment_link.paid",
        created_at: 1,
        payload: {
          payment_link: { entity: { id: "plink_1", reference_id: "req_1", notes: { document_id: "d1" } } },
          payment: { entity: { id: "pay_1", amount: 49900, currency: "INR" } },
        },
      },
      "e2",
    );
    expect(event).toMatchObject({
      kind: "payment_succeeded",
      paymentId: "pay_1",
      amountMinor: 49900,
      currency: "INR",
      reference: "plink_1",
      metadata: { document_id: "d1", reference_id: "req_1" },
    });
  });
});

describe("status mapping and license effect", () => {
  it.each([
    ["stripe", "active", "active", "activate"],
    ["stripe", "trialing", "active", "activate"],
    ["stripe", "past_due", "past_due", "activate"],
    ["stripe", "unpaid", "halted", "deactivate"],
    ["stripe", "canceled", "cancelled", "deactivate"],
    ["stripe", "incomplete", "incomplete", "none"],
    ["stripe", "something_new", "incomplete", "none"],
    ["razorpay", "authenticated", "incomplete", "none"],
    ["razorpay", "active", "active", "activate"],
    ["razorpay", "pending", "past_due", "activate"],
    ["razorpay", "halted", "halted", "deactivate"],
    ["razorpay", "completed", "cancelled", "deactivate"],
    ["razorpay", "paused", "paused", "deactivate"],
  ] as const)("%s %s -> %s (%s)", (provider, raw, status, effect) => {
    const mapped = mapSubscriptionStatus(provider, raw);
    expect(mapped).toBe(status);
    expect(licenseEffect(mapped)).toBe(effect);
  });

  it("converts minor units without float drift", () => {
    expect(toMinorUnits(1499.5)).toBe(149950);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
    expect(fromMinorUnits(149950)).toBe(1499.5);
  });
});
