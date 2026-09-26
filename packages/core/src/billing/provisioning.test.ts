import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, writtenRow, type RecordedQuery } from "../test-support/fake-supabase";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
const lifecycle = vi.hoisted(() => ({ activateLicense: vi.fn(), deactivateLicense: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));
vi.mock("../licensing/lifecycle", () => lifecycle);

const { planLicenseChanges, reconcileSubscriptionLicenses } = await import("./provisioning");

const SUB = "5ub00000-0000-0000-0000-000000000001";
const OTHER_SUB = "5ub00000-0000-0000-0000-000000000002";
const BUSINESS = "b0000000-0000-0000-0000-000000000001";
const lic = (module_key: string, over: Record<string, unknown> = {}) => ({
  id: `l-${module_key}`,
  module_key,
  status: "active",
  cancel_at: null,
  source: "manual",
  subscription_id: null,
  ...over,
}) as never;

afterEach(() => vi.clearAllMocks());

describe("BILL-17 planLicenseChanges", () => {
  it("activates missing modules and adopts every module the plan includes", () => {
    const changes = planLicenseChanges({ id: SUB, entitled: true }, ["crm", "discovery", "gst"], [lic("discovery")]);
    expect(changes).toEqual({ activate: ["crm", "gst"], adopt: ["crm", "discovery", "gst"], deactivate: [] });
  });

  it("is idempotent: a fully provisioned business needs nothing", () => {
    const owned = (m: string) => lic(m, { source: "subscription", subscription_id: SUB });
    const changes = planLicenseChanges({ id: SUB, entitled: true }, ["crm", "discovery"], [owned("crm"), owned("discovery")]);
    expect(changes).toEqual({ activate: [], adopt: [], deactivate: [] });
  });

  it("restores a module in grace and undoes a scheduled manual cancellation", () => {
    const changes = planLicenseChanges({ id: SUB, entitled: true }, ["crm", "fsm"], [
      lic("crm", { status: "grace", source: "subscription", subscription_id: SUB }),
      lic("fsm", { cancel_at: "2026-10-01T00:00:00Z", source: "subscription", subscription_id: SUB }),
    ]);
    expect(changes.activate).toEqual(["crm", "fsm"]);
  });

  it("never touches a manual licence the plan doesn't include (existing customers keep access)", () => {
    const changes = planLicenseChanges({ id: SUB, entitled: true }, ["discovery"], [lic("discovery"), lic("inventory")]);
    expect(changes.deactivate).toEqual([]);
  });

  it("moves only this subscription's licences into grace when it stops entitling", () => {
    const changes = planLicenseChanges({ id: SUB, entitled: false }, ["crm", "discovery"], [
      lic("crm", { source: "subscription", subscription_id: SUB }),
      lic("discovery", { source: "subscription", subscription_id: OTHER_SUB }),
      lic("gst"),
      lic("fsm", { status: "grace", source: "subscription", subscription_id: SUB }),
    ]);
    expect(changes).toEqual({ activate: [], adopt: [], deactivate: ["crm"] });
  });

  it("a downgrade removes only the modules the new plan drops", () => {
    const owned = (m: string) => lic(m, { source: "subscription", subscription_id: SUB });
    const changes = planLicenseChanges({ id: SUB, entitled: true }, ["discovery"], [owned("discovery"), owned("crm")]);
    expect(changes.deactivate).toEqual(["crm"]);
    expect(changes.activate).toEqual([]);
  });
});

describe("BILL-18 reconcileSubscriptionLicenses", () => {
  function wire(subscription: Record<string, unknown>, licenses: unknown[], currentPlan: string) {
    const fake = createFakeSupabase({
      query: (call: RecordedQuery) => {
        if (call.table === "subscriptions" && call.ops.some((o) => o.method === "single")) return { data: subscription, error: null };
        if (call.table === "subscriptions") return { data: [], error: null };
        if (call.table === "plan_modules") return { data: [{ module_key: "crm" }, { module_key: "discovery" }], error: null };
        if (call.table === "plans" && eqFilters(call).price === 0) return { data: [{ key: "free" }], error: null };
        if (call.table === "plans") return { data: { id: "plan-pro", key: "pro", name: "Pro", description: null, price: 2999, currency: "INR", billing_interval: "month", status: "active", display_order: 1, marketing_visible: true }, error: null };
        if (call.table === "licenses" && call.ops.some((o) => o.method === "select")) return { data: licenses, error: null };
        if (call.table === "business_settings" && call.ops.some((o) => o.method === "select")) return { data: { plan: currentPlan }, error: null };
        return { data: null, error: null };
      },
    });
    createAdminClient.mockReturnValue(fake);
    return fake;
  }

  it("provisions an active subscription's plan and sets the business plan", async () => {
    const fake = wire({ id: SUB, business_id: BUSINESS, plan_id: "plan-pro", status: "active" }, [lic("discovery")], "free");
    const result = await reconcileSubscriptionLicenses(SUB);
    expect(lifecycle.activateLicense).toHaveBeenCalledTimes(1);
    expect(lifecycle.activateLicense).toHaveBeenCalledWith(BUSINESS, "crm");
    expect(lifecycle.deactivateLicense).not.toHaveBeenCalled();
    const adopt = fake.queries("licenses").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(adopt)).toEqual({ source: "subscription", subscription_id: SUB });
    const planWrite = fake.queries("business_settings").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(planWrite)).toEqual({ plan: "pro" });
    expect(result.planSetting).toBe("pro");
    expect(fake.rpcs("write_audit_log")[0]?.args.p_action).toBe("billing.license_reconciled");
  });

  it("a cancelled subscription sends its licences to grace and the business back to free", async () => {
    const owned = (m: string) => lic(m, { source: "subscription", subscription_id: SUB });
    const fake = wire({ id: SUB, business_id: BUSINESS, plan_id: "plan-pro", status: "cancelled" }, [owned("crm"), owned("discovery")], "pro");
    await reconcileSubscriptionLicenses(SUB);
    expect(lifecycle.activateLicense).not.toHaveBeenCalled();
    expect(lifecycle.deactivateLicense.mock.calls).toEqual([
      [BUSINESS, "crm"],
      [BUSINESS, "discovery"],
    ]);
    const planWrite = fake.queries("business_settings").find((q) => q.ops.some((o) => o.method === "update"))!;
    expect(writtenRow(planWrite)).toEqual({ plan: "free" });
  });

  it("past_due keeps every licence (payment recovery, §11)", async () => {
    const owned = (m: string) => lic(m, { source: "subscription", subscription_id: SUB });
    const fake = wire({ id: SUB, business_id: BUSINESS, plan_id: "plan-pro", status: "past_due" }, [owned("crm"), owned("discovery")], "pro");
    await reconcileSubscriptionLicenses(SUB);
    expect(lifecycle.activateLicense).not.toHaveBeenCalled();
    expect(lifecycle.deactivateLicense).not.toHaveBeenCalled();
    expect(fake.rpcs("write_audit_log")).toHaveLength(0);
  });
});
