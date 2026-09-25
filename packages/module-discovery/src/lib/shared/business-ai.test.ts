/**
 * The shared business-scoped AI call: every run is recorded in core.ai_runs, and a
 * provider failure or schema-violating output becomes a typed error rather than a stored
 * result (CLAUDE.md AI rules 5–7).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const h = vi.hoisted(() => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  recordAiRun: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: h.generateObject, generateText: h.generateText }));
vi.mock("@cofounderai/core/ai-usage/mutations", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("@cofounderai/core/ai/provider-factory", () => ({ createWebSearchTools: () => ({}) }));
vi.mock("@cofounderai/core/ai/business-router", async () => {
  class AiProviderError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    resolveBusinessAiModel: h.resolve,
    toAiProviderError: (e: unknown) => (e instanceof AiProviderError ? e : new AiProviderError("invalid_response", String(e))),
  };
});

const { runBusinessAi, businessAiInputHash } = await import("./business-ai");
const schema = z.object({ ok: z.boolean() });

beforeEach(() => {
  vi.clearAllMocks();
  h.resolve.mockResolvedValue({ provider: "anthropic", modelId: "m1", model: {} });
  h.recordAiRun.mockResolvedValue(undefined);
});

describe("runBusinessAi", () => {
  it("records a successful run with its prompt version and model-independent hash", async () => {
    h.generateObject.mockResolvedValue({ object: { ok: true }, usage: { inputTokens: 10, outputTokens: 5 } });
    const result = await runBusinessAi({ businessId: "b1", operation: "marketing_content_assist", promptVersion: "v1", prompt: "p", schema });
    expect(result.object).toEqual({ ok: true });
    expect(result.inputHash).toBe(businessAiInputHash("p", "v1"));
    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded", promptVersion: "v1", inputTokens: 10, businessId: "b1" }));
  });

  it("records a failure and throws a typed error when the output does not fit the schema", async () => {
    h.generateObject.mockRejectedValue(new Error("No object generated"));
    await expect(runBusinessAi({ businessId: "b1", operation: "marketing_content_assist", promptVersion: "v1", prompt: "p", schema })).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorCode: "invalid_response" }));
  });

  it("does not call the model at all when no provider is connected", async () => {
    h.resolve.mockRejectedValue(Object.assign(new Error("Connect an AI provider"), { code: "no_provider_connected" }));
    await expect(runBusinessAi({ businessId: "b1", operation: "marketing_content_assist", promptVersion: "v1", prompt: "p", schema })).rejects.toThrow(/Connect/);
    expect(h.generateObject).not.toHaveBeenCalled();
  });
});
