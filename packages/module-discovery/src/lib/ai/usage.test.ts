/**
 * `ai_runs` is an append-only cost ledger, not a result store. Its defining rule is in the
 * docstring: a logging failure must never break the caller's actual result — an AI
 * operation that succeeded but whose ledger row failed is still a success for the founder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
const { estimateCost } = vi.hoisted(() => ({ estimateCost: vi.fn(() => 0.42) }));
vi.mock("../../db/server", () => ({ createClient }));
vi.mock("@cofounderai/core/ai/client", () => ({ estimateCost }));

const { recordAiRun } = await import("./usage");

const BASE = {
  workspaceId: "w1",
  operation: "generate_icp",
  model: "claude-x",
  promptVersion: "v1",
  inputHash: "a".repeat(64),
  status: "succeeded" as const,
};

function mock(error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: null, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  estimateCost.mockReturnValue(0.42);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => consoleError.mockRestore());

describe("recordAiRun", () => {
  it("writes the ledger row, nulling every omitted optional", async () => {
    const supabase = mock();

    await recordAiRun(BASE);

    expect(writtenRow(supabase.queries("ai_runs")[0]!)).toEqual({
      workspace_id: "w1",
      operation: "generate_icp",
      model: "claude-x",
      prompt_version: "v1",
      input_hash: BASE.inputHash,
      input_tokens: null,
      output_tokens: null,
      search_count: null,
      estimated_cost: null,
      status: "succeeded",
      account_id: null,
      provider: null,
      duration_ms: null,
      error_code: null,
    });
  });

  it("estimates cost only when both token counts are known", async () => {
    const supabase = mock();

    await recordAiRun({ ...BASE, inputTokens: 100, outputTokens: 200 });

    expect(estimateCost).toHaveBeenCalledWith("claude-x", 100, 200);
    expect(writtenRow(supabase.queries("ai_runs")[0]!)).toMatchObject({ estimated_cost: 0.42 });
  });

  it.each([
    ["only input tokens", { inputTokens: 100 }],
    ["only output tokens", { outputTokens: 200 }],
    ["neither", {}],
  ])("leaves cost null given %s", async (_label, tokens) => {
    const supabase = mock();

    await recordAiRun({ ...BASE, ...tokens });

    expect(writtenRow(supabase.queries("ai_runs")[0]!)).toMatchObject({ estimated_cost: null });
    expect(estimateCost).not.toHaveBeenCalled();
  });

  it("costs a zero-token run rather than treating zero as unknown", async () => {
    const supabase = mock();
    estimateCost.mockReturnValue(0);

    await recordAiRun({ ...BASE, inputTokens: 0, outputTokens: 0 });

    expect(writtenRow(supabase.queries("ai_runs")[0]!)).toMatchObject({ estimated_cost: 0 });
  });

  it("records the BYOK attribution fields", async () => {
    const supabase = mock();

    await recordAiRun({
      ...BASE,
      status: "failed",
      accountId: "acct-1",
      provider: "anthropic",
      durationMs: 1234,
      errorCode: "rate_limited",
      searchCount: 3,
    });

    expect(writtenRow(supabase.queries("ai_runs")[0]!)).toMatchObject({
      status: "failed",
      account_id: "acct-1",
      provider: "anthropic",
      duration_ms: 1234,
      error_code: "rate_limited",
      search_count: 3,
    });
  });

  it("uses a caller-supplied client (the webhook path has no signed-in user)", async () => {
    const supplied = createFakeSupabase({ query: () => ({ data: null, error: null }) });

    await recordAiRun({ ...BASE, client: supplied as never });

    expect(createClient).not.toHaveBeenCalled();
    expect(supplied.queries("ai_runs")).toHaveLength(1);
  });

  it("never throws when the ledger write fails — the caller's result still stands", async () => {
    mock(new Error("insert denied"));

    await expect(recordAiRun(BASE)).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to record ai_runs"),
      "insert denied",
    );
  });
});
