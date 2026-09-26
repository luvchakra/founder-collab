import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow, type RecordedQuery } from "../test-support/fake-supabase";
import type { ProviderSubscription } from "./subscription-types";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));

const { mergePaymentStatus, resolveSubscriptionPlan, syncSubscription, UnknownBillingReferenceError } = await import("./sync");

afterEach(() => vi.clearAllMocks());

const providerSub = (over: Partial<ProviderSubscription> = {}): ProviderSubscription => ({
  id: "sub_1",
  customerId: "cus_1",
  status: "active",
  providerStatus: "active",
  providerPriceId: "price_pro",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  trialStart: null,
  trialEnd: null,
  metadata: { business_id: "biz-1", checkout_session_id: "sess-1" },
  ...over,
});

describe("BILL-15 plan resolution", () => {
  const existing = { plan_id: "pro", pending_plan_id: "starter", pending_change_at: "2026-10-01T00:00:00Z" };

  it("keeps the current plan through a downgrade scheduled for renewal, even once the provider bills the new price", () => {
    expect(resolveSubscriptionPlan(existing, "starter", new Date("2026-09-20T00:00:00Z"))).toEqual({ planId: "pro", clearPending: false });
  });

  it("applies the pending plan once its time comes", () => {
    expect(resolveSubscriptionPlan(existing, "starter", new Date("2026-10-01T00:00:01Z"))).toEqual({ planId: "starter", clearPending: true });
  });

  it("follows the billed price otherwise, and falls back to the stored plan for an unmapped price", () => {
    expect(resolveSubscriptionPlan({ plan_id: "pro", pending_plan_id: null, pending_change_at: null }, "max")).toEqual({ planId: "max", clearPending: false });
    expect(resolveSubscriptionPlan({ plan_id: "pro", pending_plan_id: null, pending_change_at: null }, null)).toEqual({ planId: "pro", clearPending: false });
  });
});

describe("BILL-16 payment status merge", () => {
  it("never walks a later payment state back", () => {
    expect(mergePaymentStatus("succeeded", "failed")).toBe("succeeded");
    expect(mergePaymentStatus("refunded", "succeeded")).toBe("refunded");
    expect(mergePaymentStatus("failed", "succeeded")).toBe("succeeded");
    expect(mergePaymentStatus(null, "pending")).toBe("pending");
    expect(mergePaymentStatus("succeeded", "disputed")).toBe("disputed");
  });
});

describe("BILL-15 syncSubscription", () => {
  function wire(session: Record<string, unknown> | null) {
    const fake = createFakeSupabase({
      query: (call: RecordedQuery) => {
        const selecting = call.ops.some((o) => o.method === "select") && !call.ops.some((o) => o.method === "insert" || o.method === "update");
        if (call.table === "subscriptions" && selecting) return { data: null, error: null };
        if (call.table === "plan_prices") return { data: { id: "pp", plan_id: "plan-pro", provider: "stripe", environment: "test", currency: "USD", billing_interval: "month", amount: 29, provider_product_id: null, provider_price_id: "price_pro", active: true }, error: null };
        if (call.table === "checkout_sessions" && selecting) return { data: session, error: null };
        if (call.table === "subscriptions" && call.ops.some((o) => o.method === "insert")) return { data: { id: "ws-sub" }, error: null };
        if (call.table === "subscriptions" && call.ops.some((o) => o.method === "update")) return { data: [], error: null };
        return { data: null, error: null };
      },
    });
    createAdminClient.mockReturnValue(fake);
    return fake;
  }

  it("creates the subscription for the business its WonderArk checkout session belongs to", async () => {
    const fake = wire({ id: "sess-1", business_id: "biz-1", plan_id: "plan-pro", provider: "stripe", environment: "test", status: "open" });
    const synced = await syncSubscription("stripe", "test", providerSub());
    expect(synced).toMatchObject({ id: "ws-sub", businessId: "biz-1", planId: "plan-pro", status: "active", previousStatus: null });
    const insert = fake.queries("subscriptions").find((q) => q.ops.some((o) => o.method === "insert"))!;
    expect(writtenRow(insert)).toMatchObject({ business_id: "biz-1", plan_id: "plan-pro", provider: "stripe", status: "active", amount: 29 });
    const completed = fake.queries("checkout_sessions").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(completed)).toMatchObject({ status: "completed", subscription_id: "ws-sub" });
  });

  it("refuses metadata naming a business other than the session's (spoofed metadata)", async () => {
    wire({ id: "sess-1", business_id: "biz-OTHER", plan_id: "plan-pro", provider: "stripe", environment: "test", status: "open" });
    await expect(syncSubscription("stripe", "test", providerSub())).rejects.toBeInstanceOf(UnknownBillingReferenceError);
  });

  it("refuses a session created for the other provider or environment", async () => {
    wire({ id: "sess-1", business_id: "biz-1", plan_id: "plan-pro", provider: "stripe", environment: "live", status: "open" });
    await expect(syncSubscription("stripe", "test", providerSub())).rejects.toBeInstanceOf(UnknownBillingReferenceError);
  });

  it("refuses a provider subscription with no WonderArk checkout at all", async () => {
    wire(null);
    await expect(syncSubscription("stripe", "test", providerSub({ metadata: {} }))).rejects.toBeInstanceOf(UnknownBillingReferenceError);
  });
});
