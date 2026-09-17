/**
 * ADR-5 / CLAUDE.md non-negotiable #6 regression suite for the domain-event drain loop.
 *
 * `scripts/test-core-domain-events.mjs` proves the SQL side (backoff arithmetic, the
 * `record_domain_event_attempt()` / `replay_parked_events()` functions, RLS on the
 * table). What it cannot see is which outcome *this* loop chooses for a given event, and
 * that distinction is the whole point of the design: an unlicensed `required_module` is
 * a normal result that parks without burning an attempt (non-negotiable #6 — callers
 * treat "not licensed" as a result, not an exception), a missing handler is permanent
 * (retrying will never register one), and a throwing handler is a retry. Getting those
 * three confused is silent data loss, so they are pinned here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase, type QueryResult, type RecordedQuery } from "../test-support/fake-supabase";
import { registerEventHandler } from "./registry";
import type { DomainEvent } from "./types";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));

const { drainDomainEvents, replayParkedEvents } = await import("./drain");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    id: "e1",
    business_id: BUSINESS,
    type: "test.noop",
    required_module: null,
    payload: {},
    status: "pending",
    attempts: 0,
    max_attempts: 5,
    next_attempt_at: "2026-09-17T00:00:00.000Z",
    last_error: null,
    published_at: "2026-09-17T00:00:00.000Z",
    processed_at: null,
    ...overrides,
  };
}

/** Wires up a fake admin client that returns `events` from the due-events query. */
function mockAdmin(events: DomainEvent[], rpc?: (fn: string) => QueryResult): FakeSupabase {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery): QueryResult =>
      call.table === "domain_events" ? { data: events, error: null } : { data: null, error: null },
    rpc: (call) => (rpc ? rpc(call.fn) : { data: null, error: null }),
  });
  createAdminClient.mockReturnValue(supabase);
  return supabase;
}

/** The outcome recorded for an event, as passed to record_domain_event_attempt(). */
function outcomes(supabase: FakeSupabase) {
  return supabase.rpcs("record_domain_event_attempt").map((c) => c.args.p_outcome);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("drainDomainEvents", () => {
  it("selects only due, pending events, oldest first, up to the limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
    const supabase = mockAdmin([]);

    await drainDomainEvents(7);

    const query = supabase.queries("domain_events")[0]!;
    expect(query.ops.find((op) => op.method === "eq")!.args).toEqual(["status", "pending"]);
    expect(query.ops.find((op) => op.method === "lte")!.args).toEqual([
      "next_attempt_at",
      "2026-09-17T12:00:00.000Z",
    ]);
    expect(query.ops.find((op) => op.method === "order")!.args).toEqual(["published_at"]);
    expect(query.ops.find((op) => op.method === "limit")!.args).toEqual([7]);
    vi.useRealTimers();
  });

  it("returns a zeroed tally when nothing is due", async () => {
    mockAdmin([]);
    expect(await drainDomainEvents()).toEqual({ processed: 0, parked: 0, failed: 0 });
  });

  it("processes an event whose handler resolves", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerEventHandler("test.processed", handler);
    const event = makeEvent({ type: "test.processed" });
    const supabase = mockAdmin([event]);

    expect(await drainDomainEvents()).toEqual({ processed: 1, parked: 0, failed: 0 });
    expect(handler).toHaveBeenCalledWith(event);
    expect(outcomes(supabase)).toEqual(["processed"]);
  });

  it("parks — never fails — an event whose required_module is unlicensed", async () => {
    registerEventHandler("test.parked", vi.fn());
    const supabase = mockAdmin([makeEvent({ type: "test.parked", required_module: "inventory" })], () => ({
      data: false,
      error: null,
    }));

    expect(await drainDomainEvents()).toEqual({ processed: 0, parked: 1, failed: 0 });
    expect(outcomes(supabase)).toEqual(["parked"]);
  });

  it("checks the license against the event's own business and module", async () => {
    const supabase = mockAdmin([makeEvent({ required_module: "fsm" })], () => ({ data: false, error: null }));

    await drainDomainEvents();

    expect(supabase.rpcs("has_module")[0]!.args).toEqual({ p_business_id: BUSINESS, p_key: "fsm" });
  });

  it("does not consult the license at all when required_module is unset", async () => {
    registerEventHandler("test.unrestricted", vi.fn().mockResolvedValue(undefined));
    const supabase = mockAdmin([makeEvent({ type: "test.unrestricted" })]);

    await drainDomainEvents();

    expect(supabase.rpcs("has_module")).toEqual([]);
  });

  it("runs a licensed event's handler normally (degraded mode is the exception, not the rule)", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    registerEventHandler("test.licensed", handler);
    const supabase = mockAdmin([makeEvent({ type: "test.licensed", required_module: "inventory" })], () => ({
      data: true,
      error: null,
    }));

    expect(await drainDomainEvents()).toEqual({ processed: 1, parked: 0, failed: 0 });
    expect(handler).toHaveBeenCalledOnce();
    expect(outcomes(supabase)).toEqual(["processed"]);
  });

  it("permanently fails an event with no registered handler, and says why", async () => {
    const supabase = mockAdmin([makeEvent({ type: "test.nobody-listens" })]);

    expect(await drainDomainEvents()).toEqual({ processed: 0, parked: 0, failed: 1 });
    const attempt = supabase.rpcs("record_domain_event_attempt")[0]!;
    expect(attempt.args.p_outcome).toBe("failed_permanent");
    expect(String(attempt.args.p_error)).toContain("test.nobody-listens");
  });

  it("schedules a retry — not a permanent failure — when a handler throws", async () => {
    registerEventHandler("test.throws", vi.fn().mockRejectedValue(new Error("downstream down")));
    const supabase = mockAdmin([makeEvent({ type: "test.throws" })]);

    expect(await drainDomainEvents()).toEqual({ processed: 0, parked: 0, failed: 1 });
    const attempt = supabase.rpcs("record_domain_event_attempt")[0]!;
    expect(attempt.args.p_outcome).toBe("failed_retry");
    expect(attempt.args.p_error).toBe("downstream down");
  });

  it("stringifies a non-Error thrown by a handler rather than losing it", async () => {
    registerEventHandler("test.throws-string", vi.fn().mockRejectedValue("just a string"));
    const supabase = mockAdmin([makeEvent({ type: "test.throws-string" })]);

    await drainDomainEvents();

    expect(supabase.rpcs("record_domain_event_attempt")[0]!.args.p_error).toBe("just a string");
  });

  it("keeps draining after one event fails, and tallies each outcome independently", async () => {
    registerEventHandler("test.mixed-ok", vi.fn().mockResolvedValue(undefined));
    registerEventHandler("test.mixed-throws", vi.fn().mockRejectedValue(new Error("boom")));
    registerEventHandler("test.mixed-parked", vi.fn());
    const supabase = mockAdmin(
      [
        makeEvent({ id: "e1", type: "test.mixed-ok" }),
        makeEvent({ id: "e2", type: "test.mixed-throws" }),
        makeEvent({ id: "e3", type: "test.mixed-parked", required_module: "gst" }),
        makeEvent({ id: "e4", type: "test.mixed-unknown" }),
      ],
      (fn) => (fn === "has_module" ? { data: false, error: null } : { data: null, error: null }),
    );

    expect(await drainDomainEvents()).toEqual({ processed: 1, parked: 1, failed: 2 });
    expect(outcomes(supabase)).toEqual(["processed", "failed_retry", "parked", "failed_permanent"]);
    expect(supabase.rpcs("record_domain_event_attempt").map((c) => c.args.p_event_id)).toEqual([
      "e1",
      "e2",
      "e3",
      "e4",
    ]);
  });

  it("surfaces a failed due-events query instead of reporting an empty drain", async () => {
    const supabase = createFakeSupabase({ query: () => ({ data: null, error: new Error("select denied") }) });
    createAdminClient.mockReturnValue(supabase);

    await expect(drainDomainEvents()).rejects.toThrow("select denied");
  });

  it("surfaces a failed license check rather than silently parking the event", async () => {
    mockAdmin([makeEvent({ required_module: "inventory" })], (fn) =>
      fn === "has_module" ? { data: null, error: new Error("rpc denied") } : { data: null, error: null },
    );

    await expect(drainDomainEvents()).rejects.toThrow("rpc denied");
  });
});

describe("replayParkedEvents", () => {
  it("un-parks a business's events for one module and returns the count", async () => {
    const supabase = createFakeSupabase({ rpc: () => ({ data: 3, error: null }) });
    createAdminClient.mockReturnValue(supabase);

    expect(await replayParkedEvents(BUSINESS, "inventory")).toBe(3);
    expect(supabase.rpcs("replay_parked_events")[0]!.args).toEqual({
      p_business_id: BUSINESS,
      p_module: "inventory",
    });
  });

  it("propagates a replay failure", async () => {
    createAdminClient.mockReturnValue(
      createFakeSupabase({ rpc: () => ({ data: null, error: new Error("replay denied") }) }),
    );

    await expect(replayParkedEvents(BUSINESS, "inventory")).rejects.toThrow("replay denied");
  });
});
