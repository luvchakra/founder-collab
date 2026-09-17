/**
 * Research is the most expensive operation in the app: a provider-executed web search at
 * the reasoning tier, then a cheap structuring pass. Two things protect that cost — the
 * dedup window (a double-clicked "Research" would otherwise run web search twice for
 * identical input) and using `modelAtTier` for the second pass, which reuses the already
 * resolved credential rather than fetching and decrypting again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getProspect: vi.fn(),
  getWorkspace: vi.fn(),
  getProduct: vi.fn(),
  getIcpProfile: vi.fn(),
  getProspectResearch: vi.fn(),
  generateText: vi.fn(),
  generateObject: vi.fn(),
  recordAiRun: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  hasRecentSuccess: vi.fn(),
  resolveAiModel: vi.fn(),
  toAiProviderError: vi.fn(),
  createWebSearchTools: vi.fn(() => ({ web_search: { tool: true } })),
  modelAtTier: vi.fn((tier: string) => ({ id: `claude-${tier}` })),
}));

vi.mock("ai", () => ({ generateText: h.generateText, generateObject: h.generateObject }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({ getWorkspace: h.getWorkspace, getProduct: h.getProduct }));
vi.mock("../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../research/queries", () => ({ getProspectResearch: h.getProspectResearch }));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./dedup", () => ({ hasRecentSuccess: h.hasRecentSuccess }));
vi.mock("./router", () => ({ resolveAiModel: h.resolveAiModel, toAiProviderError: h.toAiProviderError }));
vi.mock("@cofounderai/core/ai/provider-factory", () => ({ createWebSearchTools: h.createWebSearchTools }));

const { researchProspect } = await import("./research-prospect");

const DRAFT = {
  summary: "They make widgets",
  pain_points: ["stockouts"],
  buying_signals: ["hiring ops"],
  recent_events: ["raised a round"],
  recommended_angle: "lead with stockouts",
  evidence: [{ claim: "hiring ops", source_url: "https://x", confidence: "fact" }],
};

function mockUpsert(error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data: { id: "r1", ...DRAFT }, error }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProspect.mockResolvedValue({ id: "p1", workspace_id: "w1", company_name: "Acme" });
  h.getWorkspace.mockResolvedValue({ id: "w1", product_id: "prod-1" });
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", product_profile: {} });
  // The real prompt builder is used (not mocked), so the ICP fixture needs the fields it
  // reads — a thinner stub would fail inside the prompt rather than in the code under test.
  h.getIcpProfile.mockResolvedValue({
    status: "approved",
    name: "Mid-market manufacturers",
    buying_signals: ["hiring ops"],
  });
  h.getProspectResearch.mockResolvedValue(null);
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.hasRecentSuccess.mockResolvedValue(false);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-reasoning",
    model: { id: "claude-reasoning" },
    modelAtTier: h.modelAtTier,
  });
  h.generateText.mockResolvedValue({
    text: "  findings text  ",
    usage: { inputTokens: 100, outputTokens: 50 },
    toolCalls: [{ n: 1 }, { n: 2 }],
  });
  h.generateObject.mockResolvedValue({ object: DRAFT, usage: { inputTokens: 30, outputTokens: 10 } });
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "rate_limited" }));
});

describe("researchProspect — guards", () => {
  it.each([
    ["prospect", () => h.getProspect.mockResolvedValue(null), "Prospect not found."],
    ["workspace", () => h.getWorkspace.mockResolvedValue(null), "Workspace not found."],
    ["product", () => h.getProduct.mockResolvedValue(null), "Product not found."],
  ])("refuses when the %s is not visible", async (_label, arrange, message) => {
    arrange();

    await expect(researchProspect("p1")).rejects.toThrow(message);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("checks the spend cap before resolving a model", async () => {
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(researchProspect("p1")).rejects.toThrow("allowance");
    expect(h.resolveAiModel).not.toHaveBeenCalled();
  });

  it("proceeds without an ICP — research does not require one", async () => {
    h.getIcpProfile.mockResolvedValue(null);
    mockUpsert();

    await researchProspect("p1");

    expect(h.generateText).toHaveBeenCalled();
  });

  it("returns existing research on a dedup hit, without paying for web search", async () => {
    const existing = { id: "r1" };
    h.hasRecentSuccess.mockResolvedValue(true);
    h.getProspectResearch.mockResolvedValue(existing);

    await expect(researchProspect("p1")).resolves.toBe(existing);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("runs anyway on a dedup hit with no stored research to return", async () => {
    h.hasRecentSuccess.mockResolvedValue(true);
    h.getProspectResearch.mockResolvedValue(null);
    mockUpsert();

    await researchProspect("p1");

    expect(h.generateText).toHaveBeenCalled();
  });
});

describe("researchProspect — the two passes", () => {
  it("searches with the provider's own web-search tool at the reasoning tier", async () => {
    mockUpsert();

    await researchProspect("p1");

    expect(h.createWebSearchTools).toHaveBeenCalledWith("anthropic");
    expect(h.generateText.mock.calls[0]![0]).toMatchObject({
      model: { id: "claude-reasoning" },
      tools: { web_search: { tool: true } },
    });
  });

  it("structures the findings with the fast tier, reusing the same credential", async () => {
    mockUpsert();

    await researchProspect("p1");

    expect(h.modelAtTier).toHaveBeenCalledWith("fast");
    expect(h.generateObject.mock.calls[0]![0]).toMatchObject({ model: { id: "claude-fast" } });
    expect(h.resolveAiModel).toHaveBeenCalledTimes(1);
  });

  it("refuses to structure empty findings rather than inventing a profile", async () => {
    mockUpsert();
    h.generateText.mockResolvedValue({ text: "   ", usage: {}, toolCalls: [] });

    await expect(researchProspect("p1")).rejects.toThrow("normalized");
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("bills both passes together and records how many searches ran", async () => {
    mockUpsert();

    await researchProspect("p1");

    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        inputTokens: 130,
        outputTokens: 60,
        searchCount: 2,
      }),
    );
  });
});

describe("researchProspect — persistence", () => {
  it("upserts one research row per prospect, with a 30-day expiry", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-17T00:00:00.000Z"));
      const supabase = mockUpsert();

      await researchProspect("p1");

      const [row, options] = opArgs(supabase.queries("prospect_research")[0]!, "upsert")! as [
        Record<string, unknown>,
        unknown,
      ];
      expect(options).toEqual({ onConflict: "prospect_id" });
      expect(row).toMatchObject({ workspace_id: "w1", prospect_id: "p1", summary: DRAFT.summary });
      expect(row.expires_at).toBe("2026-10-17T00:00:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries the evidence and its confidence tags through unchanged", async () => {
    const supabase = mockUpsert();

    await researchProspect("p1");

    const row = opArgs(supabase.queries("prospect_research")[0]!, "upsert")![0] as Record<string, unknown>;
    expect(row.evidence).toEqual(DRAFT.evidence);
  });

  it("normalizes a provider failure and records it", async () => {
    mockUpsert();
    h.generateText.mockRejectedValue(new Error("boom"));

    await expect(researchProspect("p1")).rejects.toThrow("normalized");
    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", errorCode: "rate_limited" }),
    );
  });

  it("propagates a failed upsert as a normalized error", async () => {
    mockUpsert(new Error("upsert denied"));

    await expect(researchProspect("p1")).rejects.toThrow("normalized");
  });
});

/** The search prompt is the only thing steering the provider's web search, so the parts
 * that vary with a thin product or prospect are worth pinning: a product with no profile
 * yet, an ICP with no buying signals recorded, and a prospect whose website we know. */
describe("researchProspect — search prompt", () => {
  const prompt = () => String(h.generateText.mock.calls[0]![0].prompt);

  beforeEach(() => mockUpsert());

  it("points the search at the prospect's website when one is known", async () => {
    h.getProspect.mockResolvedValue({
      id: "p1",
      workspace_id: "w1",
      company_name: "Acme",
      website: "https://acme.example",
    });

    await researchProspect("p1");

    expect(prompt()).toContain('Research the company "Acme" (https://acme.example) using web search.');
  });

  it("names the product alone when it has no profile yet", async () => {
    h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", product_profile: null });

    await researchProspect("p1");

    expect(prompt()).toContain('Our product: "Widgets"');
  });

  it("says so when the ICP records no buying signals", async () => {
    h.getIcpProfile.mockResolvedValue({
      status: "approved",
      name: "Mid-market manufacturers",
      buying_signals: [],
    });

    await researchProspect("p1");

    expect(prompt()).toContain("Buying signals we look for: none specified.");
  });
});
