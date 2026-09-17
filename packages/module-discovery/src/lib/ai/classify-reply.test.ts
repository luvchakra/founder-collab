/**
 * Reply classification runs from the inbound-email webhook, which has no user session, so
 * its defining property is that the admin client is threaded through *every* lookup —
 * including the AI router's own credential resolution and the usage check. Miss one and
 * that hop silently sees zero rows under RLS.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  generateObject: vi.fn(),
  recordAiRun: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  resolveAiModel: vi.fn(),
  toAiProviderError: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("../../db/admin", () => ({ createAdminClient: h.createAdminClient }));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./router", () => ({ resolveAiModel: h.resolveAiModel, toAiProviderError: h.toAiProviderError }));

const { classifyReply } = await import("./classify-reply");

const INBOUND = { id: "m1", direction: "inbound", workspace_id: "w1", content: "Sounds good" };
const DRAFT = { classification: "interested", recommended_action: "Book a call" };

function mockAdmin(overrides: { message?: unknown; error?: unknown } = {}) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (overrides.error) return { data: null, error: overrides.error };
      if (call.table === "messages") {
        return { data: usedOp(call, "update") ? { ...INBOUND, ...DRAFT } : overrides.message ?? INBOUND, error: null };
      }
      if (call.table === "workspaces") return { data: { id: "w1", product_id: "p1" }, error: null };
      if (call.table === "products") return { data: { name: "Widgets" }, error: null };
      return { data: null, error: null };
    },
  });
  h.createAdminClient.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-fast",
    model: { id: "claude-fast" },
  });
  h.generateObject.mockResolvedValue({ object: DRAFT, usage: { inputTokens: 40, outputTokens: 20 } });
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "timeout" }));
});

describe("classifyReply", () => {
  it("stores the classification and recommended action on the message", async () => {
    const supabase = mockAdmin();

    await expect(classifyReply("m1")).resolves.toMatchObject(DRAFT);

    const update = supabase.queries("messages").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toEqual({
      classification: "interested",
      recommended_action: "Book a call",
    });
    expect(eqFilters(update)).toEqual({ id: "m1" });
  });

  it("refuses to classify an outbound message", async () => {
    mockAdmin({ message: { ...INBOUND, direction: "outbound" } });

    await expect(classifyReply("m1")).rejects.toThrow("Only inbound messages can be classified.");
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("threads the admin client into the usage check and the router", async () => {
    const supabase = mockAdmin();

    await classifyReply("m1");

    expect(h.assertWithinUsageLimit).toHaveBeenCalledWith("w1", supabase);
    expect(h.resolveAiModel).toHaveBeenCalledWith("w1", "classify_reply", supabase);
  });

  it("records the ledger row through the admin client too", async () => {
    const supabase = mockAdmin();

    await classifyReply("m1");

    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ client: supabase, status: "succeeded", operation: "classify_reply" }),
    );
  });

  it("checks the spend cap before resolving a model", async () => {
    mockAdmin();
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(classifyReply("m1")).rejects.toThrow("allowance");
    expect(h.resolveAiModel).not.toHaveBeenCalled();
  });

  it("normalizes a provider failure and still records why it failed", async () => {
    mockAdmin();
    h.generateObject.mockRejectedValue(new Error("boom"));

    await expect(classifyReply("m1")).rejects.toThrow("normalized");
    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorCode: "timeout" }),
    );
  });

  it("leaves the message unchanged when classification failed", async () => {
    const supabase = mockAdmin();
    h.generateObject.mockRejectedValue(new Error("boom"));

    await expect(classifyReply("m1")).rejects.toThrow();
    expect(supabase.queries("messages").filter((c) => usedOp(c, "update"))).toEqual([]);
  });

  it("propagates a failed lookup", async () => {
    mockAdmin({ error: new Error("not visible") });

    await expect(classifyReply("m1")).rejects.toThrow("not visible");
  });
});
