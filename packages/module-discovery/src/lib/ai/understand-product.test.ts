/**
 * Product understanding is the one AI operation with a real freshness cache: `ai_runs` has
 * no result column, so "cached" means the stored profile was generated after every current
 * knowledge source's last update. That comparison is the whole saving — get it wrong and
 * either every page view re-bills, or an edited source never changes the profile.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listProductKnowledge: vi.fn(),
  generateObject: vi.fn(),
  recordAiRun: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  hasRecentSuccess: vi.fn(),
  resolveAiModel: vi.fn(),
  toAiProviderError: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../tenancy/queries", () => ({
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
}));
vi.mock("../knowledge/queries", () => ({ listProductKnowledge: h.listProductKnowledge }));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./dedup", () => ({ hasRecentSuccess: h.hasRecentSuccess }));
vi.mock("./router", () => ({ resolveAiModel: h.resolveAiModel, toAiProviderError: h.toAiProviderError }));

const { understandProduct } = await import("./understand-product");

const PROFILE = { category: "B2B SaaS", problem: "p", solution: "s" };
const SOURCE = {
  source_type: "file",
  source_name: "spec.pdf",
  content: "text",
  updated_at: "2026-09-01T00:00:00.000Z",
};

function mockUpdate(error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: null, error }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", product_profile: null, product_profile_generated_at: null });
  h.getWorkspaceForProduct.mockResolvedValue({ id: "w1" });
  h.listProductKnowledge.mockResolvedValue([SOURCE]);
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.hasRecentSuccess.mockResolvedValue(false);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-x",
    model: { id: "claude-x" },
  });
  h.generateObject.mockResolvedValue({ object: PROFILE, usage: { inputTokens: 10, outputTokens: 20 } });
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "timeout" }));
});

describe("understandProduct — guards", () => {
  it("refuses a product that is not visible", async () => {
    h.getProduct.mockResolvedValue(null);
    await expect(understandProduct("prod-1")).rejects.toThrow("Product not found.");
  });

  it("refuses when the workspace cannot be resolved", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);
    await expect(understandProduct("prod-1")).rejects.toThrow("Workspace not found for product.");
  });

  it("refuses with no knowledge sources to reason from", async () => {
    h.listProductKnowledge.mockResolvedValue([]);

    await expect(understandProduct("prod-1")).rejects.toThrow(/knowledge source/);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("checks the spend cap before resolving a model", async () => {
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(understandProduct("prod-1")).rejects.toThrow("allowance");
    expect(h.resolveAiModel).not.toHaveBeenCalled();
  });
});

describe("understandProduct — freshness cache", () => {
  it("returns the stored profile when it postdates every source", async () => {
    h.getProduct.mockResolvedValue({
      id: "prod-1",
      name: "Widgets",
      product_profile: PROFILE,
      product_profile_generated_at: "2026-09-02T00:00:00.000Z",
    });

    await expect(understandProduct("prod-1")).resolves.toBe(PROFILE);
    expect(h.generateObject).not.toHaveBeenCalled();
    expect(h.assertWithinUsageLimit).not.toHaveBeenCalled();
  });

  it("regenerates when a source was edited after the profile was generated", async () => {
    h.getProduct.mockResolvedValue({
      id: "prod-1",
      name: "Widgets",
      product_profile: PROFILE,
      product_profile_generated_at: "2026-09-01T00:00:00.000Z",
    });
    h.listProductKnowledge.mockResolvedValue([{ ...SOURCE, updated_at: "2026-09-03T00:00:00.000Z" }]);
    mockUpdate();

    await understandProduct("prod-1");

    expect(h.generateObject).toHaveBeenCalled();
  });

  it("compares against the newest source, not the first", async () => {
    h.getProduct.mockResolvedValue({
      id: "prod-1",
      name: "Widgets",
      product_profile: PROFILE,
      product_profile_generated_at: "2026-09-02T00:00:00.000Z",
    });
    h.listProductKnowledge.mockResolvedValue([
      { ...SOURCE, updated_at: "2026-09-01T00:00:00.000Z" },
      { ...SOURCE, updated_at: "2026-09-05T00:00:00.000Z" },
    ]);
    mockUpdate();

    await understandProduct("prod-1");

    expect(h.generateObject).toHaveBeenCalled();
  });

  it("regenerates when forced, even though the profile is fresh", async () => {
    h.getProduct.mockResolvedValue({
      id: "prod-1",
      name: "Widgets",
      product_profile: PROFILE,
      product_profile_generated_at: "2026-09-09T00:00:00.000Z",
    });
    mockUpdate();

    await understandProduct("prod-1", { force: true });

    expect(h.generateObject).toHaveBeenCalled();
  });

  it("regenerates when there is no profile yet, whatever the timestamps", async () => {
    mockUpdate();

    await understandProduct("prod-1");

    expect(h.generateObject).toHaveBeenCalled();
  });

  it("still short-circuits a double-clicked Regenerate via the dedup window", async () => {
    h.getProduct.mockResolvedValue({
      id: "prod-1",
      name: "Widgets",
      product_profile: PROFILE,
      product_profile_generated_at: "2026-09-01T00:00:00.000Z",
    });
    h.listProductKnowledge.mockResolvedValue([{ ...SOURCE, updated_at: "2026-09-03T00:00:00.000Z" }]);
    h.hasRecentSuccess.mockResolvedValue(true);

    await expect(understandProduct("prod-1", { force: true })).resolves.toBe(PROFILE);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("does not short-circuit on a dedup hit when there is no profile to return", async () => {
    h.hasRecentSuccess.mockResolvedValue(true);
    mockUpdate();

    await understandProduct("prod-1");

    expect(h.generateObject).toHaveBeenCalled();
  });
});

describe("understandProduct — persistence", () => {
  it("stores the profile and stamps when it was generated", async () => {
    const supabase = mockUpdate();

    await expect(understandProduct("prod-1")).resolves.toBe(PROFILE);

    const call = supabase.queries("products")[0]!;
    expect(writtenRow(call)).toMatchObject({ product_profile: PROFILE });
    expect(writtenRow(call)!.product_profile_generated_at).toEqual(expect.any(String));
    expect(eqFilters(call)).toEqual({ id: "prod-1" });
  });

  it("records a succeeded ledger row", async () => {
    mockUpdate();

    await understandProduct("prod-1");

    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "understand_product", status: "succeeded", inputTokens: 10 }),
    );
  });

  it("normalizes a provider failure, records it, and persists nothing", async () => {
    const supabase = mockUpdate();
    h.generateObject.mockRejectedValue(new Error("boom"));

    await expect(understandProduct("prod-1")).rejects.toThrow("normalized");
    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorCode: "timeout" }),
    );
    expect(supabase.queries("products")).toEqual([]);
  });

  it("propagates a failed persist", async () => {
    mockUpdate(new Error("update denied"));

    await expect(understandProduct("prod-1")).rejects.toThrow("update denied");
  });
});
