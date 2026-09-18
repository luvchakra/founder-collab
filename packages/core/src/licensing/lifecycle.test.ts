/**
 * ADR-9 / CLAUDE.md non-negotiable #4 regression suite: "cancelling a license never
 * deletes data — 30-day read-only grace, then access denied but rows retained;
 * reactivation restores everything and replays parked events."
 *
 * The database half of that rule is proven by the RLS scripts (`tenant AND licensed`
 * policies keep rows readable during grace). This is the other half: that the state
 * machine in our own code writes `grace`, not a delete; that the window really is 30
 * days; and that reactivation is what triggers the parked-event replay ADR-5 relies on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  eqFilters,
  usedOp,
  writtenRow,
  type FakeSupabase,
  type QueryResult,
  type RecordedQuery,
} from "../test-support/fake-supabase";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
const { replayParkedEvents } = vi.hoisted(() => ({ replayParkedEvents: vi.fn() }));

vi.mock("../db/admin", () => ({ createAdminClient }));
vi.mock("../events/drain", () => ({ replayParkedEvents }));

const {
  activateLicense,
  deactivateLicense,
  expireGracePeriods,
  reactivateLicense,
  seedDefaultLicenses,
} = await import("./lifecycle");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";
const ACCOUNT = "a0000000-0000-0000-0000-000000000001";
const LICENSE = "11111111-1111-1111-1111-111111111111";

/** Wires a fake client in as the admin client and hands it back for assertions. */
function mockAdmin(responder: (call: RecordedQuery) => QueryResult): FakeSupabase {
  const supabase = createFakeSupabase({ query: responder });
  createAdminClient.mockReturnValue(supabase);
  return supabase;
}

/**
 * The happy-path responder: `existingLicense` is what the initial lookup finds (null for
 * "this business has never licensed this module"), everything else succeeds silently.
 */
function respondWith(existingLicense: { id: string; status: string } | null) {
  return (call: RecordedQuery): QueryResult => {
    if (call.table === "businesses") return { data: { account_id: ACCOUNT }, error: null };
    if (call.table === "licenses") {
      // Order matters: the insert and update chains both carry a trailing .select(), so
      // the read-only lookup is only the one that carries neither.
      if (usedOp(call, "insert")) return { data: { id: LICENSE }, error: null };
      if (usedOp(call, "update")) return { data: { id: existingLicense?.id ?? LICENSE }, error: null };
      return { data: existingLicense, error: null };
    }
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  replayParkedEvents.mockResolvedValue(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("activateLicense", () => {
  it("creates a license against the business's account when none exists", async () => {
    const supabase = mockAdmin(respondWith(null));

    await activateLicense(BUSINESS, "inventory");

    const insert = supabase.queries("licenses").find((c) => usedOp(c, "insert"))!;
    expect(writtenRow(insert)).toMatchObject({
      account_id: ACCOUNT,
      business_id: BUSINESS,
      module_key: "inventory",
      status: "active",
    });
  });

  it("records an 'activated' license event and publishes a matching domain event", async () => {
    const supabase = mockAdmin(respondWith(null));

    await activateLicense(BUSINESS, "inventory");

    expect(writtenRow(supabase.queries("license_events")[0]!)).toMatchObject({
      license_id: LICENSE,
      business_id: BUSINESS,
      module_key: "inventory",
      event_type: "activated",
    });
    expect(writtenRow(supabase.queries("domain_events")[0]!)).toMatchObject({
      business_id: BUSINESS,
      type: "license.activated",
      payload: { module_key: "inventory", license_id: LICENSE },
    });
  });

  it("is idempotent on an already-active license — no write, no event, no replay", async () => {
    const supabase = mockAdmin(respondWith({ id: LICENSE, status: "active" }));

    await activateLicense(BUSINESS, "inventory");

    expect(supabase.queries().filter((c) => usedOp(c, "insert") || usedOp(c, "update"))).toEqual([]);
    expect(replayParkedEvents).not.toHaveBeenCalled();
  });

  it.each(["grace", "expired", "cancelled"])(
    "restores a '%s' license to active and clears its grace bookkeeping (ADR-9)",
    async (status) => {
      const supabase = mockAdmin(respondWith({ id: LICENSE, status }));

      await activateLicense(BUSINESS, "inventory");

      const update = supabase.queries("licenses").find((c) => usedOp(c, "update"))!;
      expect(writtenRow(update)).toMatchObject({
        status: "active",
        deactivated_at: null,
        grace_ends_at: null,
      });
      expect(writtenRow(supabase.queries("license_events")[0]!)).toMatchObject({
        event_type: "reactivated",
      });
    },
  );

  it("replays parked events for the module on both first activation and reactivation", async () => {
    mockAdmin(respondWith(null));
    await activateLicense(BUSINESS, "inventory");
    expect(replayParkedEvents).toHaveBeenCalledWith(BUSINESS, "inventory");

    replayParkedEvents.mockClear();
    mockAdmin(respondWith({ id: LICENSE, status: "grace" }));
    await activateLicense(BUSINESS, "inventory");
    expect(replayParkedEvents).toHaveBeenCalledWith(BUSINESS, "inventory");
  });

  it("propagates a failed insert instead of silently reporting success", async () => {
    mockAdmin((call) =>
      call.table === "licenses" && usedOp(call, "insert")
        ? { data: null, error: new Error("insert denied") }
        : respondWith(null)(call),
    );

    await expect(activateLicense(BUSINESS, "inventory")).rejects.toThrow("insert denied");
  });
});

describe("deactivateLicense", () => {
  it("moves the license to a 30-day grace window and never deletes it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
    const supabase = mockAdmin(respondWith({ id: LICENSE, status: "active" }));

    await deactivateLicense(BUSINESS, "inventory");

    const update = supabase.queries("licenses").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toMatchObject({
      status: "grace",
      deactivated_at: "2026-09-17T00:00:00.000Z",
      grace_ends_at: "2026-10-17T00:00:00.000Z",
    });
    expect(supabase.queries().some((c) => usedOp(c, "delete"))).toBe(false);
  });

  it("scopes the update to this business and module only", async () => {
    const supabase = mockAdmin(respondWith({ id: LICENSE, status: "active" }));

    await deactivateLicense(BUSINESS, "inventory");

    const update = supabase.queries("licenses").find((c) => usedOp(c, "update"))!;
    expect(eqFilters(update)).toEqual({ business_id: BUSINESS, module_key: "inventory" });
  });

  it("records a 'deactivated' event", async () => {
    const supabase = mockAdmin(respondWith({ id: LICENSE, status: "active" }));

    await deactivateLicense(BUSINESS, "inventory");

    expect(writtenRow(supabase.queries("license_events")[0]!)).toMatchObject({
      event_type: "deactivated",
      module_key: "inventory",
    });
  });

  it("is a no-op for a module the business never licensed", async () => {
    const supabase = mockAdmin(() => ({ data: null, error: null }));

    await deactivateLicense(BUSINESS, "gst");

    expect(supabase.queries("license_events")).toEqual([]);
    expect(supabase.queries("domain_events")).toEqual([]);
  });
});

describe("reactivateLicense", () => {
  it("behaves as activateLicense on an existing grace license", async () => {
    const supabase = mockAdmin(respondWith({ id: LICENSE, status: "grace" }));

    await reactivateLicense(BUSINESS, "inventory");

    expect(writtenRow(supabase.queries("licenses").find((c) => usedOp(c, "update"))!)).toMatchObject(
      { status: "active" },
    );
    expect(replayParkedEvents).toHaveBeenCalledWith(BUSINESS, "inventory");
  });
});

describe("expireGracePeriods", () => {
  it("only expires grace licenses whose window has already elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
    const supabase = mockAdmin((call) =>
      call.table === "licenses" ? { data: [], error: null } : { data: null, error: null },
    );

    await expireGracePeriods();

    const update = supabase.queries("licenses")[0]!;
    expect(writtenRow(update)).toEqual({ status: "expired" });
    expect(eqFilters(update)).toEqual({ status: "grace" });
    expect(update.ops.find((op) => op.method === "lte")!.args).toEqual([
      "grace_ends_at",
      "2026-09-17T00:00:00.000Z",
    ]);
  });

  it("records an 'expired' event per license and returns how many it expired", async () => {
    const expired = [
      { id: "l1", business_id: "b1", module_key: "inventory" },
      { id: "l2", business_id: "b2", module_key: "fsm" },
    ];
    const supabase = mockAdmin((call) =>
      call.table === "licenses" ? { data: expired, error: null } : { data: null, error: null },
    );

    expect(await expireGracePeriods()).toBe(2);
    expect(supabase.queries("license_events").map((c) => writtenRow(c))).toMatchObject([
      { license_id: "l1", business_id: "b1", module_key: "inventory", event_type: "expired" },
      { license_id: "l2", business_id: "b2", module_key: "fsm", event_type: "expired" },
    ]);
  });

  it("returns 0 when nothing is due", async () => {
    mockAdmin((call) =>
      call.table === "licenses" ? { data: null, error: null } : { data: null, error: null },
    );

    expect(await expireGracePeriods()).toBe(0);
  });
});

describe("seedDefaultLicenses", () => {
  it("gives a brand-new business a discovery license and nothing else", async () => {
    const supabase = mockAdmin(respondWith(null));

    await seedDefaultLicenses(BUSINESS);

    const inserts = supabase.queries("licenses").filter((c) => usedOp(c, "insert"));
    expect(inserts).toHaveLength(1);
    expect(writtenRow(inserts[0]!)).toMatchObject({ module_key: "discovery", status: "active" });
  });
});

/**
 * Every failure in this file must surface, never be swallowed: a licence whose event was
 * not recorded, or whose status update silently failed, leaves the platform's entitlement
 * state and its audit trail disagreeing.
 */
describe("failure propagation", () => {
  it("propagates a failed status update when restoring an existing licence", async () => {
    mockAdmin((call) =>
      call.table === "licenses" && usedOp(call, "update")
        ? { data: null, error: new Error("update denied") }
        : respondWith({ id: LICENSE, status: "grace" })(call),
    );

    await expect(activateLicense(BUSINESS, "inventory")).rejects.toThrow("update denied");
    expect(replayParkedEvents).not.toHaveBeenCalled();
  });

  it("propagates a failed initial licence lookup", async () => {
    mockAdmin((call) =>
      call.table === "licenses" ? { data: null, error: new Error("select denied") } : { data: null, error: null },
    );

    await expect(activateLicense(BUSINESS, "inventory")).rejects.toThrow("select denied");
  });

  it("propagates a failed business lookup, so no licence is created against a missing account", async () => {
    const supabase = mockAdmin((call) =>
      call.table === "businesses"
        ? { data: null, error: new Error("business not visible") }
        : respondWith(null)(call),
    );

    await expect(activateLicense(BUSINESS, "inventory")).rejects.toThrow("business not visible");
    expect(supabase.queries("licenses").filter((c) => usedOp(c, "insert"))).toEqual([]);
  });

  it("propagates a failed license_events insert rather than reporting success", async () => {
    mockAdmin((call) =>
      call.table === "license_events"
        ? { data: null, error: new Error("event denied") }
        : respondWith(null)(call),
    );

    await expect(activateLicense(BUSINESS, "inventory")).rejects.toThrow("event denied");
    expect(replayParkedEvents).not.toHaveBeenCalled();
  });

  it("propagates a failed domain_events publish", async () => {
    mockAdmin((call) =>
      call.table === "domain_events"
        ? { data: null, error: new Error("publish denied") }
        : respondWith(null)(call),
    );

    await expect(activateLicense(BUSINESS, "inventory")).rejects.toThrow("publish denied");
  });

  it("propagates a failed deactivation update", async () => {
    mockAdmin((call) =>
      call.table === "licenses" && usedOp(call, "update")
        ? { data: null, error: new Error("deactivate denied") }
        : respondWith({ id: LICENSE, status: "active" })(call),
    );

    await expect(deactivateLicense(BUSINESS, "inventory")).rejects.toThrow("deactivate denied");
  });

  it("propagates a failed grace-expiry sweep", async () => {
    mockAdmin((call) =>
      call.table === "licenses" ? { data: null, error: new Error("expire denied") } : { data: null, error: null },
    );

    await expect(expireGracePeriods()).rejects.toThrow("expire denied");
  });
});
