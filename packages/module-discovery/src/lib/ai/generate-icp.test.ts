/**
 * The AI operations all share one shape: guard → usage cap → resolve model → dedup →
 * generate → ledger → persist. generate_icp is the one tested exhaustively, because every
 * guard in it protects something specific — an approved ICP must never be silently
 * clobbered (blueprint §13), a double-clicked "Regenerate" must not re-bill for identical
 * input, and a failed generation must still leave a ledger row saying what it cost and why
 * it failed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getIcpProfile: vi.fn(),
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
vi.mock("../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./dedup", () => ({ hasRecentSuccess: h.hasRecentSuccess }));
vi.mock("./router", () => ({
  resolveAiModel: h.resolveAiModel,
  toAiProviderError: h.toAiProviderError,
}));

const { generateIcp } = await import("./generate-icp");

const PRODUCT = { id: "prod-1", name: "Widgets", product_profile: { category: "B2B" } };
const WORKSPACE = { id: "w1" };
const DRAFT = {
  name: "Mid-market manufacturers",
  description: "They make things",
  industries: ["Manufacturing"],
  company_sizes: ["50-200"],
  geographies: ["India"],
  roles: ["Ops"],
  pain_points: ["Stockouts"],
  buying_signals: ["Hiring"],
  exclusions: ["Retail"],
};

function mockUpsert(error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: { id: "icp-1", ...DRAFT }, error }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(PRODUCT);
  h.getWorkspaceForProduct.mockResolvedValue(WORKSPACE);
  h.getIcpProfile.mockResolvedValue(null);
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.hasRecentSuccess.mockResolvedValue(false);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-x",
    model: { id: "claude-x" },
  });
  h.generateObject.mockResolvedValue({
    object: DRAFT,
    usage: { inputTokens: 100, outputTokens: 200 },
  });
  h.toAiProviderError.mockImplementation((e: unknown) =>
    Object.assign(new Error("normalized"), { code: "rate_limited", cause: e }),
  );
});

describe("generateIcp — guards", () => {
  it("refuses a product that does not exist", async () => {
    h.getProduct.mockResolvedValue(null);

    await expect(generateIcp("prod-1")).rejects.toThrow("Product not found.");
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("refuses a product with no profile to reason from", async () => {
    h.getProduct.mockResolvedValue({ ...PRODUCT, product_profile: null });

    await expect(generateIcp("prod-1")).rejects.toThrow(/product profile/i);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("refuses a product whose workspace cannot be resolved", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    await expect(generateIcp("prod-1")).rejects.toThrow("Workspace not found for product.");
  });

  it("returns an approved ICP untouched rather than clobbering founder-approved data", async () => {
    const approved = { id: "icp-1", status: "approved" };
    h.getIcpProfile.mockResolvedValue(approved);

    await expect(generateIcp("prod-1")).resolves.toBe(approved);
    expect(h.generateObject).not.toHaveBeenCalled();
    expect(h.assertWithinUsageLimit).not.toHaveBeenCalled();
  });

  it("regenerates over an approved ICP when explicitly forced", async () => {
    h.getIcpProfile.mockResolvedValue({ id: "icp-1", status: "approved" });
    mockUpsert();

    await generateIcp("prod-1", { force: true });

    expect(h.generateObject).toHaveBeenCalled();
  });

  it("regenerates a draft ICP without needing force", async () => {
    h.getIcpProfile.mockResolvedValue({ id: "icp-1", status: "draft" });
    mockUpsert();

    await generateIcp("prod-1");

    expect(h.generateObject).toHaveBeenCalled();
  });

  it("checks the workspace's spend cap before resolving a model or generating", async () => {
    h.assertWithinUsageLimit.mockRejectedValue(new Error("free-tier allowance"));

    await expect(generateIcp("prod-1")).rejects.toThrow("free-tier allowance");
    expect(h.resolveAiModel).not.toHaveBeenCalled();
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("skips a re-run for identical input within the dedup window, returning what exists", async () => {
    const existing = { id: "icp-1", status: "draft" };
    h.getIcpProfile.mockResolvedValue(existing);
    h.hasRecentSuccess.mockResolvedValue(true);

    await expect(generateIcp("prod-1")).resolves.toBe(existing);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("scopes the dedup check to the resolved model, so a provider switch re-runs", async () => {
    h.getIcpProfile.mockResolvedValue({ id: "icp-1", status: "draft" });
    h.hasRecentSuccess.mockResolvedValue(true);

    await generateIcp("prod-1");

    expect(h.hasRecentSuccess).toHaveBeenCalledWith("w1", "generate_icp", expect.any(String), undefined, "claude-x");
  });

  it("does not dedup a first-ever generation, where there is nothing to return", async () => {
    h.getIcpProfile.mockResolvedValue(null);
    h.hasRecentSuccess.mockResolvedValue(true);
    mockUpsert();

    await generateIcp("prod-1");

    expect(h.generateObject).toHaveBeenCalled();
  });
});

describe("generateIcp — success", () => {
  it("persists the draft against the workspace, upserting on workspace_id", async () => {
    const supabase = mockUpsert();

    await generateIcp("prod-1");

    const call = supabase.queries("icp_profiles")[0]!;
    expect(opArgs(call, "upsert")![0]).toMatchObject({
      workspace_id: "w1",
      name: DRAFT.name,
      industries: DRAFT.industries,
      company_sizes: DRAFT.company_sizes,
      pain_points: DRAFT.pain_points,
    });
    expect(opArgs(call, "upsert")![1]).toEqual({ onConflict: "workspace_id" });
  });

  it("always persists as draft, so a regenerated ICP must be re-approved", async () => {
    const supabase = mockUpsert();

    await generateIcp("prod-1", { force: true });

    expect((opArgs(supabase.queries("icp_profiles")[0]!, "upsert")![0] as { status: string }).status).toBe(
      "draft",
    );
  });

  it("records a succeeded ledger row with tokens and BYOK attribution", async () => {
    mockUpsert();

    await generateIcp("prod-1");

    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        operation: "generate_icp",
        model: "claude-x",
        status: "succeeded",
        inputTokens: 100,
        outputTokens: 200,
        accountId: "acct-1",
        provider: "anthropic",
        durationMs: expect.any(Number),
      }),
    );
  });

  it("returns the persisted row", async () => {
    mockUpsert();

    await expect(generateIcp("prod-1")).resolves.toMatchObject({ id: "icp-1" });
  });

  it("propagates a failed upsert", async () => {
    mockUpsert(new Error("upsert denied"));

    await expect(generateIcp("prod-1")).rejects.toThrow("upsert denied");
  });
});

describe("generateIcp — failure", () => {
  it("normalizes the provider error and throws that, not the raw one", async () => {
    const raw = new Error("429 Too Many Requests");
    h.generateObject.mockRejectedValue(raw);
    mockUpsert();

    await expect(generateIcp("prod-1")).rejects.toThrow("normalized");
    expect(h.toAiProviderError).toHaveBeenCalledWith(raw, "anthropic");
  });

  it("still records a failed ledger row, carrying the classified error code", async () => {
    h.generateObject.mockRejectedValue(new Error("boom"));
    mockUpsert();

    await expect(generateIcp("prod-1")).rejects.toThrow();
    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "rate_limited",
        accountId: "acct-1",
        provider: "anthropic",
      }),
    );
  });

  it("persists nothing when generation failed", async () => {
    h.generateObject.mockRejectedValue(new Error("boom"));
    const supabase = mockUpsert();

    await expect(generateIcp("prod-1")).rejects.toThrow();
    expect(supabase.queries("icp_profiles")).toEqual([]);
  });
});
