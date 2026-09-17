/**
 * Usage is aggregated straight from the append-only ai_runs ledger on read, so this is
 * where a workspace's spend number is actually computed — the free-tier guard
 * (usage/limits.ts) blocks or allows AI calls based on exactly this arithmetic. Only
 * succeeded runs count (a failed call bills nothing), the window is the current calendar
 * month in UTC, and a batched query must produce exactly what the per-workspace one does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient }));
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

const { getWorkspaceUsage, getWorkspaceUsageForWorkspaces } = await import("./queries");

const WORKSPACE = "w1";

function mock(rows: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: rows, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T12:34:56.000Z"));
});

afterEach(() => vi.useRealTimers());

describe("getWorkspaceUsage", () => {
  it("windows on the current calendar month in UTC", async () => {
    const supabase = mock([]);

    const usage = await getWorkspaceUsage(WORKSPACE);

    expect(usage.periodStart).toBe("2026-09-01T00:00:00.000Z");
    expect(usage.periodEnd).toBe("2026-10-01T00:00:00.000Z");
    const call = supabase.queries("ai_runs")[0]!;
    expect(opArgs(call, "gte")).toEqual(["created_at", "2026-09-01T00:00:00.000Z"]);
    expect(opArgs(call, "lt")).toEqual(["created_at", "2026-10-01T00:00:00.000Z"]);
  });

  it("rolls the year over correctly in December", async () => {
    vi.setSystemTime(new Date("2026-12-15T00:00:00.000Z"));
    mock([]);

    const usage = await getWorkspaceUsage(WORKSPACE);

    expect(usage.periodEnd).toBe("2027-01-01T00:00:00.000Z");
  });

  it("counts only succeeded runs for this workspace", async () => {
    const supabase = mock([]);

    await getWorkspaceUsage(WORKSPACE);

    expect(eqFilters(supabase.queries("ai_runs")[0]!)).toEqual({
      workspace_id: WORKSPACE,
      status: "succeeded",
    });
  });

  it("totals runs and cost across the month", async () => {
    mock([
      { operation: "generate_icp", estimated_cost: 0.5 },
      { operation: "generate_icp", estimated_cost: 0.25 },
      { operation: "research_prospect", estimated_cost: 2 },
    ]);

    const usage = await getWorkspaceUsage(WORKSPACE);

    expect(usage.totalRuns).toBe(3);
    expect(usage.totalCost).toBeCloseTo(2.75, 5);
  });

  it("groups by operation, most expensive first", async () => {
    mock([
      { operation: "generate_icp", estimated_cost: 0.5 },
      { operation: "research_prospect", estimated_cost: 2 },
      { operation: "generate_icp", estimated_cost: 0.25 },
    ]);

    const usage = await getWorkspaceUsage(WORKSPACE);

    expect(usage.byOperation).toEqual([
      { operation: "research_prospect", runs: 1, cost: 2 },
      { operation: "generate_icp", runs: 2, cost: 0.75 },
    ]);
  });

  it("treats a null cost as zero while still counting the run", async () => {
    mock([{ operation: "generate_icp", estimated_cost: null }]);

    const usage = await getWorkspaceUsage(WORKSPACE);

    expect(usage).toMatchObject({ totalRuns: 1, totalCost: 0 });
  });

  it("returns a zeroed report for a workspace with no runs", async () => {
    mock([]);

    await expect(getWorkspaceUsage(WORKSPACE)).resolves.toMatchObject({
      workspaceId: WORKSPACE,
      totalRuns: 0,
      totalCost: 0,
      byOperation: [],
    });
  });

  it("uses a caller-supplied client (the webhook path has no signed-in user)", async () => {
    const supplied = createFakeSupabase({ query: () => ({ data: [], error: null }) });

    await getWorkspaceUsage(WORKSPACE, supplied as never);

    expect(createClient).not.toHaveBeenCalled();
    expect(supplied.queries("ai_runs")).toHaveLength(1);
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(getWorkspaceUsage(WORKSPACE)).rejects.toThrow("denied");
  });
});

describe("getWorkspaceUsageForWorkspaces", () => {
  it("aggregates every workspace in one round trip", async () => {
    const supabase = mock([
      { workspace_id: "w1", operation: "generate_icp", estimated_cost: 1 },
      { workspace_id: "w2", operation: "research_prospect", estimated_cost: 3 },
      { workspace_id: "w1", operation: "generate_icp", estimated_cost: 1 },
    ]);

    const result = await getWorkspaceUsageForWorkspaces(["w1", "w2"]);

    expect(supabase.queries("ai_runs")).toHaveLength(1);
    expect(result.w1).toMatchObject({ totalRuns: 2, totalCost: 2 });
    expect(result.w2).toMatchObject({ totalRuns: 1, totalCost: 3 });
  });

  it("produces the same shape the per-workspace call does", async () => {
    const rows = [
      { operation: "generate_icp", estimated_cost: 0.5 },
      { operation: "research_prospect", estimated_cost: 2 },
    ];
    mock(rows);
    const single = await getWorkspaceUsage("w1");

    mock(rows.map((r) => ({ ...r, workspace_id: "w1" })));
    const batched = await getWorkspaceUsageForWorkspaces(["w1"]);

    expect(batched.w1).toEqual(single);
  });

  it("returns a zeroed entry for a workspace with no runs, rather than omitting it", async () => {
    mock([{ workspace_id: "w1", operation: "generate_icp", estimated_cost: 1 }]);

    const result = await getWorkspaceUsageForWorkspaces(["w1", "w2"]);

    expect(result.w2).toMatchObject({ workspaceId: "w2", totalRuns: 0, totalCost: 0, byOperation: [] });
  });

  it("ignores rows for a workspace that was not asked about", async () => {
    mock([{ workspace_id: "w9", operation: "generate_icp", estimated_cost: 1 }]);

    const result = await getWorkspaceUsageForWorkspaces(["w1"]);

    expect(Object.keys(result)).toEqual(["w1"]);
    expect(result.w1!.totalRuns).toBe(0);
  });

  it("short-circuits an empty list without querying", async () => {
    const supabase = mock([]);

    await expect(getWorkspaceUsageForWorkspaces([])).resolves.toEqual({});
    expect(supabase.queries()).toEqual([]);
  });

  it("filters to the asked-about workspaces and succeeded runs", async () => {
    const supabase = mock([]);

    await getWorkspaceUsageForWorkspaces(["w1", "w2"]);

    const call = supabase.queries("ai_runs")[0]!;
    expect(opArgs(call, "in")).toEqual(["workspace_id", ["w1", "w2"]]);
    expect(eqFilters(call)).toEqual({ status: "succeeded" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(getWorkspaceUsageForWorkspaces(["w1"])).rejects.toThrow("denied");
  });
});
