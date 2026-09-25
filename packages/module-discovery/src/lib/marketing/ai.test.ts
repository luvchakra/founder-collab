/**
 * MKT-04/09. Marketing's AI drafts: published content is never rewritten in place, AI
 * output lands as a new draft version tagged with its origin, and identical requests
 * reuse the earlier result instead of paying twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase, type RecordedCall } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireModule: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLog: vi.fn(),
  runBusinessAi: vi.fn(),
  getContent: vi.fn(),
  listStrategies: vi.fn(),
  updateContent: vi.fn(),
  createContent: vi.fn(),
  saveStrategyDraft: vi.fn(),
  getDiscoveryContext: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: h.requireModule }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: h.requirePermission }));
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: h.writeAuditLog }));
vi.mock("../shared/business-ai", () => ({ runBusinessAi: h.runBusinessAi, businessAiInputHash: () => "hash-1" }));
vi.mock("../intelligence/context", () => ({ getDiscoveryContext: h.getDiscoveryContext, describeContext: () => "Business: Acme" }));
vi.mock("./queries", () => ({
  getContent: h.getContent,
  listStrategies: h.listStrategies,
  pickCurrentStrategy: (s: unknown[]) => s[0] ?? null,
}));
vi.mock("./mutations", async () => {
  const actual = await vi.importActual<typeof import("./mutations")>("./mutations");
  return { MarketingError: actual.MarketingError, updateContent: h.updateContent, createContent: h.createContent, saveStrategyDraft: h.saveStrategyDraft };
});

const ai = await import("./ai");
const BUSINESS = "11111111-1111-4111-8111-111111111111";
let fake: FakeSupabase;
const useFake = (r: (c: RecordedCall) => { data: unknown; error: unknown }) => {
  fake = createFakeSupabase({ query: r });
  h.createClient.mockResolvedValue(fake);
};

const content = {
  id: "c1",
  offeringId: null,
  campaignId: null,
  title: "Top tips",
  contentType: "blog",
  brief: "Tips for property managers",
  body: "Old body",
  summary: null,
  audience: null,
  channel: null,
  cta: null,
  status: "approved",
  seoMetadata: {},
};
const output = { title: "New", body: "New body", summary: null, cta: null, seoTitle: "SEO", seoDescription: null, headings: [], faq: [] };

beforeEach(() => {
  vi.clearAllMocks();
  h.getDiscoveryContext.mockResolvedValue({ evidence: [], offerings: [{ id: "p" }], business: { description: "x" } });
  h.runBusinessAi.mockResolvedValue({ object: output, model: "m" });
});

describe("assistContent", () => {
  it("refuses to rewrite published content, without calling the model", async () => {
    useFake(() => ({ data: null, error: null }));
    h.getContent.mockResolvedValue({ ...content, status: "published" });
    await expect(ai.assistContent(BUSINESS, "c1", { mode: "rewrite", style: "shorter" })).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(h.runBusinessAi).not.toHaveBeenCalled();
  });

  it("saves a rewrite as a new version tagged ai_rewritten, through the normal edit path", async () => {
    useFake(() => ({ data: null, error: null }));
    h.getContent.mockResolvedValue(content);
    await ai.assistContent(BUSINESS, "c1", { mode: "rewrite", style: "clearer" });
    const [, , input, provenance] = h.updateContent.mock.calls[0]!;
    expect(input).toMatchObject({ body: "New body", title: "New" });
    expect(provenance).toMatchObject({ origin: "ai_rewritten", sourceRefs: expect.objectContaining({ inputHash: "hash-1" }) });
  });

  it("keeps the body unchanged for SEO suggestions", async () => {
    useFake(() => ({ data: null, error: null }));
    h.getContent.mockResolvedValue(content);
    await ai.assistContent(BUSINESS, "c1", { mode: "seo" });
    expect(h.updateContent.mock.calls[0]![2]).toMatchObject({ body: "Old body", seoTitle: "SEO" });
  });

  it("repurposes into a new draft item and leaves the original alone", async () => {
    useFake(() => ({ data: null, error: null }));
    h.getContent.mockResolvedValue({ ...content, status: "published" });
    h.createContent.mockResolvedValue("c2");
    await expect(ai.assistContent(BUSINESS, "c1", { mode: "repurpose", targetType: "social" })).resolves.toMatchObject({ contentId: "c2" });
    expect(h.createContent.mock.calls[0]![2]).toBe("ai_repurposed");
    expect(h.updateContent).not.toHaveBeenCalled();
  });

  it("reuses an identical earlier result", async () => {
    useFake(() => ({ data: { content_id: "c1" }, error: null }));
    h.getContent.mockResolvedValue(content);
    await expect(ai.assistContent(BUSINESS, "c1", { mode: "rewrite", style: "clearer" })).resolves.toMatchObject({ cached: true });
    expect(h.runBusinessAi).not.toHaveBeenCalled();
  });
});

describe("draftStrategyWithAi", () => {
  it("saves the AI strategy as a draft version with its provenance, never as active", async () => {
    useFake(() => ({ data: null, error: null }));
    h.listStrategies.mockResolvedValue([]);
    h.runBusinessAi.mockResolvedValue({
      object: {
        name: "Draft",
        category: null,
        targetProblem: null,
        positioningStatement: "P",
        marketContext: null,
        headline: null,
        supportingPoints: [],
        proofPoints: [],
        differentiators: [],
        competitorStatements: [],
        whyUs: null,
        regions: [],
        industries: [],
        companySegments: [],
        buyerSegments: [],
        keyMessages: [],
        channels: ["linkedin"],
        assumptions: ["No customer proof yet"],
      },
      model: "m",
    });
    h.saveStrategyDraft.mockResolvedValue("s1");
    await ai.draftStrategyWithAi(BUSINESS, null);
    const [, input, basedOn, origin, refs] = h.saveStrategyDraft.mock.calls[0]!;
    expect(origin).toBe("ai_draft");
    expect(basedOn).toBeNull();
    expect(input.marketContext).toContain("Assumptions to check");
    expect(refs).toMatchObject({ inputHash: "hash-1" });
  });
});
