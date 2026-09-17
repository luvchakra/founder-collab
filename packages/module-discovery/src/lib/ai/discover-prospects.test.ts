/**
 * Discovery is the other web-search operation, and the only one with no input-hash dedup
 * (its inputs shift as prospects are added), so the per-workspace lock is what stops two
 * overlapping runs from both billing — and it must be released whatever happens, or the
 * workspace is wedged until the stale window elapses. The R9 duplicate check here is the
 * real enforcement; the known-companies list in the prompt is only a hint to the model.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getWorkspace: vi.fn(),
  getProduct: vi.fn(),
  getIcpProfile: vi.fn(),
  listProspects: vi.fn(),
  findDuplicateProspect: vi.fn(),
  acquireDiscoveryLock: vi.fn(),
  releaseDiscoveryLock: vi.fn(),
  generateText: vi.fn(),
  generateObject: vi.fn(),
  recordAiRun: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  resolveAiModel: vi.fn(),
  toAiProviderError: vi.fn(),
  createWebSearchTools: vi.fn(() => ({ web_search: {} })),
  modelAtTier: vi.fn((tier: string) => ({ id: `claude-${tier}` })),
}));

vi.mock("ai", () => ({ generateText: h.generateText, generateObject: h.generateObject }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../tenancy/queries", () => ({ getWorkspace: h.getWorkspace, getProduct: h.getProduct }));
vi.mock("../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../prospects/queries", () => ({ listProspects: h.listProspects }));
vi.mock("../prospects/duplicates", () => ({ findDuplicateProspect: h.findDuplicateProspect }));
vi.mock("./discovery-lock", () => ({
  acquireDiscoveryLock: h.acquireDiscoveryLock,
  releaseDiscoveryLock: h.releaseDiscoveryLock,
}));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./router", () => ({ resolveAiModel: h.resolveAiModel, toAiProviderError: h.toAiProviderError }));
vi.mock("@cofounderai/core/ai/provider-factory", () => ({ createWebSearchTools: h.createWebSearchTools }));

const { discoverProspects } = await import("./discover-prospects");

const ICP = {
  status: "approved",
  name: "Mid-market",
  industries: ["Mfg"],
  company_sizes: ["50-200"],
  geographies: ["India"],
  roles: ["Ops"],
  pain_points: ["stockouts"],
  buying_signals: ["hiring"],
  exclusions: [],
};

function candidate(n: number) {
  return {
    company_name: `Co ${n}`,
    website: `co${n}.com`,
    industry: "Mfg",
    company_size: "50-200",
    location: "India",
    description: "d",
    match_reason: "r",
    source_url: "https://x",
  };
}

function mockDb(error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: [{ id: "s1" }], error }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

function structured(...prospects: ReturnType<typeof candidate>[]) {
  h.generateObject.mockResolvedValue({
    object: { prospects },
    usage: { inputTokens: 20, outputTokens: 10 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getWorkspace.mockResolvedValue({ id: "w1", product_id: "prod-1" });
  // The real prompt builder runs, so the profile fixture needs the fields it reads.
  h.getProduct.mockResolvedValue({
    id: "prod-1",
    name: "Widgets",
    product_profile: {
      category: "B2B SaaS",
      problem: "stockouts",
      solution: "forecasting",
      target_industries: ["Manufacturing"],
      target_roles: ["Ops"],
    },
  });
  h.getIcpProfile.mockResolvedValue(ICP);
  h.listProspects.mockResolvedValue([{ company_name: "Known Co" }]);
  h.findDuplicateProspect.mockResolvedValue(null);
  h.acquireDiscoveryLock.mockResolvedValue(undefined);
  h.releaseDiscoveryLock.mockResolvedValue(undefined);
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-reasoning",
    model: { id: "claude-reasoning" },
    modelAtTier: h.modelAtTier,
  });
  h.generateText.mockResolvedValue({
    text: "findings",
    usage: { inputTokens: 200, outputTokens: 100 },
    toolCalls: [{}, {}, {}],
  });
  structured(candidate(1));
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "unknown" }));
});

describe("discoverProspects — guards", () => {
  it.each([
    ["the workspace is not visible", () => h.getWorkspace.mockResolvedValue(null), "Workspace not found."],
    ["the product is not visible", () => h.getProduct.mockResolvedValue(null), "Product not found."],
    [
      "the product has no profile",
      () => h.getProduct.mockResolvedValue({ name: "W", product_profile: null }),
      "Generate a product profile",
    ],
    ["there is no ICP", () => h.getIcpProfile.mockResolvedValue(null), "Approve an ICP"],
    ["the ICP is a draft", () => h.getIcpProfile.mockResolvedValue({ ...ICP, status: "draft" }), "Approve an ICP"],
  ])("refuses before taking the lock when %s", async (_label, arrange, message) => {
    mockDb();
    arrange();

    await expect(discoverProspects("w1")).rejects.toThrow(message);
    expect(h.acquireDiscoveryLock).not.toHaveBeenCalled();
  });

  it("takes the workspace lock before spending anything", async () => {
    mockDb();

    await discoverProspects("w1");

    expect(h.acquireDiscoveryLock).toHaveBeenCalledWith("w1");
  });

  it("does not run when the lock is already held", async () => {
    mockDb();
    h.acquireDiscoveryLock.mockRejectedValue(new Error("already running"));

    await expect(discoverProspects("w1")).rejects.toThrow("already running");
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("checks the spend cap inside the lock", async () => {
    mockDb();
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(discoverProspects("w1")).rejects.toThrow("allowance");
    expect(h.generateText).not.toHaveBeenCalled();
  });
});

describe("discoverProspects — lock release", () => {
  it("releases the lock after a successful run", async () => {
    mockDb();

    await discoverProspects("w1");

    expect(h.releaseDiscoveryLock).toHaveBeenCalledWith("w1");
  });

  it("releases the lock when the run fails, so the workspace is not wedged", async () => {
    mockDb();
    h.generateText.mockRejectedValue(new Error("boom"));

    await expect(discoverProspects("w1")).rejects.toThrow();
    expect(h.releaseDiscoveryLock).toHaveBeenCalledWith("w1");
  });

  it("releases the lock when the spend cap blocks the run", async () => {
    mockDb();
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(discoverProspects("w1")).rejects.toThrow();
    expect(h.releaseDiscoveryLock).toHaveBeenCalledWith("w1");
  });
});

describe("discoverProspects — candidates", () => {
  it("searches at the reasoning tier and structures with the fast tier", async () => {
    mockDb();

    await discoverProspects("w1");

    expect(h.generateText.mock.calls[0]![0]).toMatchObject({ model: { id: "claude-reasoning" } });
    expect(h.modelAtTier).toHaveBeenCalledWith("fast");
  });

  it("refuses to structure empty findings", async () => {
    mockDb();
    h.generateText.mockResolvedValue({ text: "   ", usage: {}, toolCalls: [] });

    await expect(discoverProspects("w1")).rejects.toThrow("normalized");
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("drops a candidate that already exists, using the same check as manual add (R9)", async () => {
    const supabase = mockDb();
    structured(candidate(1), candidate(2));
    h.findDuplicateProspect.mockImplementation(async (_w: string, c: { companyName: string }) =>
      c.companyName === "Co 1" ? { id: "existing" } : null,
    );

    await discoverProspects("w1");

    const rows = writtenRow(supabase.queries("prospect_suggestions")[0]!) as unknown as { company_name: string }[];
    expect(rows.map((r) => r.company_name)).toEqual(["Co 2"]);
  });

  it("caps the batch at ten candidates", async () => {
    const supabase = mockDb();
    structured(...Array.from({ length: 15 }, (_, i) => candidate(i)));

    await discoverProspects("w1");

    const rows = writtenRow(supabase.queries("prospect_suggestions")[0]!) as unknown as unknown[];
    expect(rows).toHaveLength(10);
  });

  it("writes nothing and returns an empty list when every candidate is a duplicate", async () => {
    const supabase = mockDb();
    h.findDuplicateProspect.mockResolvedValue({ id: "existing" });

    await expect(discoverProspects("w1")).resolves.toEqual([]);
    expect(supabase.queries("prospect_suggestions")).toEqual([]);
  });

  it("still records the ledger row when every candidate was a duplicate — the search was paid for", async () => {
    mockDb();
    h.findDuplicateProspect.mockResolvedValue({ id: "existing" });

    await discoverProspects("w1");

    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded" }));
  });

  it("bills both passes together and records the search count", async () => {
    mockDb();

    await discoverProspects("w1");

    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 220, outputTokens: 110, searchCount: 3 }),
    );
  });

  it("stages the candidates against the workspace", async () => {
    const supabase = mockDb();

    await discoverProspects("w1");

    const rows = writtenRow(supabase.queries("prospect_suggestions")[0]!) as unknown as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ workspace_id: "w1", company_name: "Co 1", match_reason: "r" });
  });
});
