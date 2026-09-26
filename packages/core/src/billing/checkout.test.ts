import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type RecordedQuery } from "../test-support/fake-supabase";
import type { PlanPrice } from "./catalog";
import type { ProviderConfig } from "./subscription-types";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
const access = vi.hoisted(() => ({ requireBillingManager: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));
vi.mock("./access", () => access);

const { choosePriceForCheckout, startCheckout, CheckoutError } = await import("./checkout");

afterEach(() => vi.clearAllMocks());

const cfg = (over: Partial<ProviderConfig>): ProviderConfig => ({
  provider: "razorpay",
  environment: "test",
  enabled: true,
  priority: 10,
  supportedCurrencies: ["INR"],
  supportedCountries: [],
  publicKey: "rzp_test_k",
  secretKey: "s",
  webhookSecret: "w",
  source: "platform",
  ...over,
});
const price = (over: Partial<PlanPrice>): PlanPrice => ({
  id: "pp1",
  planId: "plan-pro",
  provider: "razorpay",
  environment: "test",
  currency: "INR",
  billingInterval: "month",
  amount: 2999,
  providerProductId: null,
  providerPriceId: "plan_rzp_pro",
  active: true,
  ...over,
});

describe("BILL-06/07 choosePriceForCheckout", () => {
  const razorpay = cfg({});
  const stripe = cfg({ provider: "stripe", priority: 20, supportedCurrencies: ["USD", "INR"], publicKey: "pk_test" });

  it("takes the highest-priority provider with a price for the plan, interval and currency", () => {
    const result = choosePriceForCheckout([stripe, razorpay], [price({}), price({ id: "pp2", provider: "stripe", providerPriceId: "price_s" })], {
      planId: "plan-pro",
      currency: "INR",
      interval: "month",
    });
    expect("config" in result && result.config.provider).toBe("razorpay");
  });

  it("falls through to the next provider when the first has no price", () => {
    const result = choosePriceForCheckout([stripe, razorpay], [price({ id: "pp2", provider: "stripe", providerPriceId: "price_s" })], {
      planId: "plan-pro",
      currency: "INR",
      interval: "month",
    });
    expect("config" in result && result.price.providerPriceId).toBe("price_s");
  });

  it("ignores prices from the other environment", () => {
    expect(choosePriceForCheckout([razorpay], [price({ environment: "live" })], { planId: "plan-pro", currency: "INR", interval: "month" })).toEqual({
      error: "unsupported_currency",
    });
  });

  it("says not_configured when no provider is ready, unsupported_currency when none takes it", () => {
    expect(choosePriceForCheckout([cfg({ enabled: false })], [price({})], { planId: "plan-pro", currency: "INR", interval: "month" })).toEqual({ error: "not_configured" });
    expect(choosePriceForCheckout([razorpay], [price({})], { planId: "plan-pro", currency: "JPY", interval: "month" })).toEqual({ error: "unsupported_currency" });
  });
});

describe("BILL-08 startCheckout guards", () => {
  const manager = { userId: "u1", email: "o@example.com", accountId: "a1", businessId: "biz-1", businessName: "Acme" };
  function wire(live: Record<string, unknown> | null, plan: Record<string, unknown> | null) {
    const fake = createFakeSupabase({
      query: (call: RecordedQuery) => {
        if (call.table === "plans") return { data: plan, error: null };
        if (call.table === "subscriptions") return { data: live, error: null };
        return { data: null, error: null };
      },
    });
    createAdminClient.mockReturnValue(fake);
    access.requireBillingManager.mockResolvedValue(manager);
    return fake;
  }
  const pro = { id: "plan-pro", key: "pro", name: "Pro", description: null, price: 2999, currency: "INR", billing_interval: "month", status: "active", display_order: 1, marketing_visible: true };
  const input = { businessId: "biz-1", businessSlug: "acme", planId: "plan-pro", billingInterval: "month" as const, idempotencyKey: "00000000-0000-4000-8000-000000000000" };

  it("requires a billing manager before anything else", async () => {
    wire(null, pro);
    access.requireBillingManager.mockRejectedValue(new Error("Only account owners and admins can manage billing."));
    await expect(startCheckout(input)).rejects.toThrow(/owners and admins/);
  });

  it("refuses a second paid subscription (§50)", async () => {
    wire({ id: "s", plan_id: "plan-max", provider: "stripe", status: "active" }, pro);
    await expect(startCheckout(input)).rejects.toMatchObject({ code: "already_subscribed" });
  });

  it("refuses buying the plan the business is already on", async () => {
    wire({ id: "s", plan_id: "plan-pro", provider: "razorpay", status: "past_due" }, pro);
    await expect(startCheckout(input)).rejects.toBeInstanceOf(CheckoutError);
  });

  it("refuses an archived plan", async () => {
    wire(null, { ...pro, status: "archived" });
    await expect(startCheckout(input)).rejects.toMatchObject({ code: "invalid_plan" });
  });
});

describe("PLATFORM-P1-04.2 / 05.1 checkout lifecycle rules", () => {
  const manager = { userId: "u1", email: "o@example.com", accountId: "a1", businessId: "biz-1", businessName: "Acme" };
  const pro = { id: "plan-pro", key: "pro", name: "Pro", description: null, price: 2999, currency: "INR", billing_interval: "month", status: "active", display_order: 1, marketing_visible: true };
  const input = { businessId: "biz-1", businessSlug: "acme", planId: "plan-pro", billingInterval: "month" as const, idempotencyKey: "00000000-0000-4000-8000-000000000000" };

  function wire(settings: Record<string, unknown>, opts: { hadTrial?: boolean; currency?: string } = {}) {
    const fake = createFakeSupabase({
      query: (call: RecordedQuery) => {
        const has = (m: string) => call.ops.some((o) => o.method === m);
        if (call.table === "plans" && has("maybeSingle")) return { data: pro, error: null };
        if (call.table === "billing_settings") return { data: settings, error: null };
        if (call.table === "business_settings") return { data: { currency: opts.currency ?? "INR" }, error: null };
        if (call.table === "subscriptions" && has("insert")) return { data: { id: "sub-trial" }, error: null };
        if (call.table === "subscriptions" && has("single")) return { data: { id: "sub-trial", business_id: "biz-1", plan_id: "plan-pro", status: "trialing" }, error: null };
        if (call.table === "subscriptions" && has("maybeSingle")) return { data: null, error: null };
        if (call.table === "subscriptions" && has("not")) return { data: null, error: null, count: opts.hadTrial ? 1 : 0 } as never;
        if (call.table === "checkout_sessions" && has("insert")) return { data: { id: "sess-1" }, error: null };
        return { data: null, error: null };
      },
    });
    createAdminClient.mockReturnValue(fake);
    access.requireBillingManager.mockResolvedValue(manager);
    return fake;
  }

  it("starts an internal trial for an eligible plan, with no provider involved", async () => {
    const fake = wire({ trial_days: 14, trial_plan_ids: ["plan-pro"] });
    const result = await startCheckout(input);
    expect(result).toMatchObject({ provider: "internal", mode: "activated" });
    const insert = fake.queries("subscriptions").find((q) => q.ops.some((o) => o.method === "insert"))!;
    expect(insert.ops.find((o) => o.method === "insert")!.args[0]).toMatchObject({ provider: "internal", status: "trialing", amount: 0 });
  });

  it("refuses a billing currency the platform doesn't support", async () => {
    wire({ trial_days: 0, supported_currencies: ["USD"] }, { currency: "INR" });
    await expect(startCheckout(input)).rejects.toMatchObject({ code: "unsupported_currency" });
  });
});
