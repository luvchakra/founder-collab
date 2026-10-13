import { describe, expect, it, vi } from "vitest";
import { orderEnvironment, testPaymentsAllowed } from "./environment-orders";

// PLATFORM-P1-10.9: order first, then set up; a failure is marked and reported, never success.
function fakeDb(results: { insert?: { data: unknown; error: unknown }; rpc?: { data: unknown; error: unknown } }) {
  const updates: unknown[] = [];
  const db = {
    from: vi.fn(() => ({
      insert: () => ({ select: () => ({ single: async () => results.insert ?? { data: { id: "order-1" }, error: null } }) }),
      update: (patch: unknown) => {
        updates.push(patch);
        return { eq: async () => ({ error: null }) };
      },
    })),
    rpc: vi.fn(async () => results.rpc ?? { data: "env-1", error: null }),
  };
  const core = {
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () =>
          table === "licenses"
            ? { eq: async () => ({ data: [{ module_key: "discovery" }, { module_key: "crm" }], error: null }) }
            : { maybeSingle: async () => ({ data: { slug: "acme-test" } }) },
      }),
    })),
  };
  return { db, core, updates };
}

function deps(over: Record<string, unknown> = {}, results = {}) {
  const f = fakeDb(results);
  return {
    f,
    d: {
      isOwner: async () => true,
      userId: async () => "user-1",
      readyProviders: async () => 0,
      db: f.db as never,
      core: f.core as never,
      activate: vi.fn(async () => {}),
      ...over,
    },
  };
}

describe("testPaymentsAllowed", () => {
  it("only while no provider is ready, and never when switched off", () => {
    expect(testPaymentsAllowed(0, {})).toBe(true);
    expect(testPaymentsAllowed(1, {})).toBe(false);
    expect(testPaymentsAllowed(0, { BILLING_TEST_PAYMENTS: "false" })).toBe(false);
  });
});

describe("orderEnvironment", () => {
  it("records the order, sets up the environment, switches on its modules and completes the order", async () => {
    const { d, f } = deps();
    const result = await orderEnvironment("org-1", "test", d);
    expect(result).toEqual({ ok: true, message: "Test payment recorded (no money charged). The environment is ready.", slug: "acme-test" });
    expect(f.db.rpc).toHaveBeenCalledWith("create_business_environment", { p_actor: "user-1", p_parent: "org-1", p_environment: "test" });
    expect(d.activate).toHaveBeenCalledTimes(2);
    expect(f.updates).toEqual([expect.objectContaining({ status: "fulfilled", environment_business_id: "env-1" })]);
  });

  it("refuses a non-owner before anything is written", async () => {
    const { d, f } = deps({ isOwner: async () => false });
    expect(await orderEnvironment("org-1", "test", d)).toEqual({ ok: false, error: "Only the organization's owner can add environments." });
    expect(f.db.from).not.toHaveBeenCalled();
  });

  it("refuses test payments once a provider is ready", async () => {
    const { d } = deps({ readyProviders: async () => 1 });
    expect(await orderEnvironment("org-1", "test", d)).toMatchObject({ ok: false });
  });

  it("turns a double order into a clear message", async () => {
    const { d } = deps({}, { insert: { data: null, error: { code: "23505" } } });
    expect(await orderEnvironment("org-1", "test", d)).toEqual({ ok: false, error: "That environment is already being set up." });
  });

  it("marks the order failed and says why when set-up fails", async () => {
    const { d, f } = deps({}, { rpc: { data: null, error: { message: "The address acme-test is already taken." } } });
    expect(await orderEnvironment("org-1", "test", d)).toEqual({ ok: false, error: "The address acme-test is already taken." });
    expect(f.updates).toEqual([{ status: "failed", failure: "The address acme-test is already taken." }]);
  });

  it("marks the order failed when a module can't be switched on", async () => {
    const { d, f } = deps({ activate: vi.fn(async (_id: string, key: string) => { if (key === "crm") throw new Error("x"); }) });
    const result = await orderEnvironment("org-1", "test", d);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("crm") });
    expect(f.updates[0]).toMatchObject({ status: "failed" });
  });
});
