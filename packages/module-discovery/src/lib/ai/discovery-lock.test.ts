/**
 * Discovery has no stable input to hash, so R6's per-workspace lock is the only thing
 * stopping two overlapping runs from both billing. The stale-lock takeover is equally
 * load-bearing in the other direction: without it, one crashed request would wedge
 * discovery for that workspace permanently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient }));

const { DiscoveryInProgressError, acquireDiscoveryLock, releaseDiscoveryLock } = await import("./discovery-lock");

const WORKSPACE = "w1";
const NOW = "2026-09-17T12:00:00.000Z";

function mock(responder: (call: RecordedQuery) => { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ query: responder });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

/** No existing lock; the insert succeeds. */
const free = () => mock((call) => (usedOp(call, "insert") ? { data: null, error: null } : { data: null, error: null }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => vi.useRealTimers());

describe("acquireDiscoveryLock", () => {
  it("takes the lock when none is held", async () => {
    const supabase = free();

    await expect(acquireDiscoveryLock(WORKSPACE)).resolves.toBeUndefined();

    const insert = supabase.queries("prospect_discovery_locks").find((c) => usedOp(c, "insert"))!;
    expect(writtenRow(insert)).toEqual({ workspace_id: WORKSPACE });
  });

  it("refuses when a fresh lock is already held", async () => {
    mock(() => ({ data: { started_at: "2026-09-17T11:59:00.000Z" }, error: null }));

    await expect(acquireDiscoveryLock(WORKSPACE)).rejects.toBeInstanceOf(DiscoveryInProgressError);
  });

  it("names the reason in the error, so the founder knows to wait", async () => {
    mock(() => ({ data: { started_at: NOW }, error: null }));

    await expect(acquireDiscoveryLock(WORKSPACE)).rejects.toThrow(/already running/);
  });

  it("takes over a lock older than the stale window rather than wedging discovery", async () => {
    const supabase = mock((call) =>
      usedOp(call, "update")
        ? { data: null, error: null }
        : { data: { started_at: "2026-09-17T11:50:00.000Z" }, error: null },
    );

    await expect(acquireDiscoveryLock(WORKSPACE)).resolves.toBeUndefined();

    const update = supabase.queries("prospect_discovery_locks").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toEqual({ started_at: NOW });
    expect(eqFilters(update)).toEqual({ workspace_id: WORKSPACE });
  });

  it("still refuses a lock just under the stale threshold", async () => {
    // 3 minutes is the window; 2m59s is still live.
    mock(() => ({ data: { started_at: "2026-09-17T11:57:01.000Z" }, error: null }));

    await expect(acquireDiscoveryLock(WORKSPACE)).rejects.toBeInstanceOf(DiscoveryInProgressError);
  });

  it("treats losing the insert race as 'already running'", async () => {
    mock((call) =>
      usedOp(call, "insert")
        ? { data: null, error: { code: "23505", message: "duplicate key" } }
        : { data: null, error: null },
    );

    await expect(acquireDiscoveryLock(WORKSPACE)).rejects.toBeInstanceOf(DiscoveryInProgressError);
  });

  it("propagates a failed lock lookup", async () => {
    mock(() => ({ data: null, error: new Error("select denied") }));

    await expect(acquireDiscoveryLock(WORKSPACE)).rejects.toThrow("select denied");
  });

  it("propagates a failed takeover", async () => {
    mock((call) =>
      usedOp(call, "update")
        ? { data: null, error: new Error("update denied") }
        : { data: { started_at: "2026-09-17T11:00:00.000Z" }, error: null },
    );

    await expect(acquireDiscoveryLock(WORKSPACE)).rejects.toThrow("update denied");
  });
});

describe("releaseDiscoveryLock", () => {
  it("deletes the workspace's lock", async () => {
    const supabase = mock(() => ({ data: null, error: null }));

    await releaseDiscoveryLock(WORKSPACE);

    const call = supabase.queries("prospect_discovery_locks")[0]!;
    expect(usedOp(call, "delete")).toBe(true);
    expect(eqFilters(call)).toEqual({ workspace_id: WORKSPACE });
  });

  it("does not throw when the delete fails — a stale lock times out anyway", async () => {
    mock(() => ({ data: null, error: new Error("denied") }));

    await expect(releaseDiscoveryLock(WORKSPACE)).resolves.toBeUndefined();
  });
});
