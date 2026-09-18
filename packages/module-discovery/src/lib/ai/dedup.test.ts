/**
 * Duplicate-spend guard. The invariant that matters most is the model scoping: BYOK
 * cache identity is (input_hash, operation, prompt_version, model) per
 * docs/byok-ai-requirements.md §13, so a workspace that switches provider between two
 * identical-input calls must NOT be served the previous provider's result.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, type QueryResult } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient }));

const { DEDUP_WINDOW_MS, hasRecentSuccess } = await import("./dedup");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";
const HASH = "a".repeat(64);

function fake(result: QueryResult) {
  return createFakeSupabase({ query: () => result });
}

beforeEach(() => vi.clearAllMocks());

describe("hasRecentSuccess", () => {
  it("is true when a matching succeeded run exists in the window", async () => {
    createClient.mockResolvedValue(fake({ data: { id: "run-1" }, error: null }));

    expect(await hasRecentSuccess(WORKSPACE, "research_prospect", HASH)).toBe(true);
  });

  it("is false when nothing matches", async () => {
    createClient.mockResolvedValue(fake({ data: null, error: null }));

    expect(await hasRecentSuccess(WORKSPACE, "research_prospect", HASH)).toBe(false);
  });

  it("only ever considers succeeded runs for this workspace, operation and input", async () => {
    const supabase = fake({ data: null, error: null });
    createClient.mockResolvedValue(supabase);

    await hasRecentSuccess(WORKSPACE, "research_prospect", HASH);

    expect(eqFilters(supabase.queries("ai_runs")[0]!)).toEqual({
      workspace_id: WORKSPACE,
      operation: "research_prospect",
      input_hash: HASH,
      status: "succeeded",
    });
  });

  it("narrows to the model when one is given, so a provider switch cannot reuse a result", async () => {
    const supabase = fake({ data: null, error: null });
    createClient.mockResolvedValue(supabase);

    await hasRecentSuccess(WORKSPACE, "research_prospect", HASH, undefined, "claude-sonnet-5");

    expect(eqFilters(supabase.queries("ai_runs")[0]!)).toMatchObject({ model: "claude-sonnet-5" });
  });

  it("omits the model filter when no model is given (legacy callers)", async () => {
    const supabase = fake({ data: null, error: null });
    createClient.mockResolvedValue(supabase);

    await hasRecentSuccess(WORKSPACE, "research_prospect", HASH);

    expect(eqFilters(supabase.queries("ai_runs")[0]!)).not.toHaveProperty("model");
  });

  it("looks back exactly one dedup window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
    const supabase = fake({ data: null, error: null });
    createClient.mockResolvedValue(supabase);

    await hasRecentSuccess(WORKSPACE, "research_prospect", HASH);

    const since = new Date(Date.parse("2026-09-17T12:00:00.000Z") - DEDUP_WINDOW_MS).toISOString();
    expect(supabase.queries("ai_runs")[0]!.ops.find((op) => op.method === "gte")!.args).toEqual([
      "created_at",
      since,
    ]);
    vi.useRealTimers();
  });

  it("uses a caller-supplied client instead of opening its own", async () => {
    const supplied = fake({ data: null, error: null });

    await hasRecentSuccess(WORKSPACE, "research_prospect", HASH, supplied as never);

    expect(createClient).not.toHaveBeenCalled();
    expect(supplied.queries("ai_runs")).toHaveLength(1);
  });

  it("propagates a query error rather than reporting 'no recent success'", async () => {
    createClient.mockResolvedValue(fake({ data: null, error: new Error("select denied") }));

    await expect(hasRecentSuccess(WORKSPACE, "research_prospect", HASH)).rejects.toThrow(
      "select denied",
    );
  });
});
