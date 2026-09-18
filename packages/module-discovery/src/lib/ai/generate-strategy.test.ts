/**
 * Strategy generation enforces blueprint §18's pipeline: product profile -> approved ICP
 * -> research, in that order. Each guard exists because generating a strategy without its
 * input produces confident nonsense rather than an error, so every one is tested for
 * refusing *before* the paid call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getProspect: vi.fn(),
  getWorkspace: vi.fn(),
  getProduct: vi.fn(),
  getIcpProfile: vi.fn(),
  getProspectResearch: vi.fn(),
  getProspectScore: vi.fn(),
  generateObject: vi.fn(),
  recordAiRun: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  resolveAiModel: vi.fn(),
  toAiProviderError: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({ getWorkspace: h.getWorkspace, getProduct: h.getProduct }));
vi.mock("../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../research/queries", () => ({ getProspectResearch: h.getProspectResearch }));
vi.mock("../scoring/queries", () => ({ getProspectScore: h.getProspectScore }));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./router", () => ({ resolveAiModel: h.resolveAiModel, toAiProviderError: h.toAiProviderError }));

const { generateOutreachStrategy } = await import("./generate-strategy");

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
const RESEARCH = {
  summary: "s",
  pain_points: ["stockouts"],
  buying_signals: ["hiring"],
  recent_events: [],
  recommended_angle: "angle",
  evidence: [],
};
const DRAFT = { channel: "email", angle: "a", talking_points: ["t"], cta: "book a call" };

function mockDb(contact: unknown = null, error: unknown = null) {
  const supabase = createFakeSupabase({
    query: (call) =>
      call.table === "contacts" ? { data: contact, error: null } : { data: { id: "s1", ...DRAFT }, error },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProspect.mockResolvedValue({ id: "p1", workspace_id: "w1", company_name: "Acme" });
  h.getWorkspace.mockResolvedValue({ id: "w1", product_id: "prod-1" });
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", product_profile: { category: "B2B" } });
  h.getIcpProfile.mockResolvedValue(ICP);
  h.getProspectResearch.mockResolvedValue(RESEARCH);
  h.getProspectScore.mockResolvedValue({ overall_score: 70 });
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-reasoning",
    model: { id: "claude-reasoning" },
  });
  h.generateObject.mockResolvedValue({ object: DRAFT, usage: { inputTokens: 50, outputTokens: 25 } });
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "unknown" }));
});

describe("generateOutreachStrategy — pipeline guards", () => {
  it.each([
    ["the prospect is not visible", () => h.getProspect.mockResolvedValue(null), "Prospect not found."],
    ["the workspace is not visible", () => h.getWorkspace.mockResolvedValue(null), "Workspace not found."],
    ["the product is not visible", () => h.getProduct.mockResolvedValue(null), "Product not found."],
    [
      "the product has no profile",
      () => h.getProduct.mockResolvedValue({ id: "prod-1", name: "W", product_profile: null }),
      "Generate a product profile",
    ],
    ["there is no ICP", () => h.getIcpProfile.mockResolvedValue(null), "Approve an ICP"],
    ["the ICP is only a draft", () => h.getIcpProfile.mockResolvedValue({ ...ICP, status: "draft" }), "Approve an ICP"],
    ["the prospect has no research", () => h.getProspectResearch.mockResolvedValue(null), "Research this prospect"],
  ])("refuses before the paid call when %s", async (_label, arrange, message) => {
    mockDb();
    arrange();

    await expect(generateOutreachStrategy("p1", null)).rejects.toThrow(message);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("proceeds without a score — scoring is optional for strategy", async () => {
    mockDb();
    h.getProspectScore.mockResolvedValue(null);

    await generateOutreachStrategy("p1", null);

    expect(h.generateObject).toHaveBeenCalled();
  });

  it("checks the spend cap before resolving a model", async () => {
    mockDb();
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(generateOutreachStrategy("p1", null)).rejects.toThrow("allowance");
    expect(h.resolveAiModel).not.toHaveBeenCalled();
  });
});

describe("generateOutreachStrategy — contact targeting", () => {
  it("loads the chosen contact so the strategy can address them", async () => {
    const supabase = mockDb({ id: "c1", first_name: "Ada" });

    await generateOutreachStrategy("p1", "c1");

    expect(eqFilters(supabase.queries("contacts")[0]!)).toEqual({ id: "c1" });
  });

  it("does not query contacts when none was chosen", async () => {
    const supabase = mockDb();

    await generateOutreachStrategy("p1", null);

    expect(supabase.queries("contacts")).toEqual([]);
  });
});

describe("generateOutreachStrategy — outcome", () => {
  it("persists the draft strategy against the prospect", async () => {
    const supabase = mockDb();

    await generateOutreachStrategy("p1", null);

    const row = writtenRow(supabase.queries("outreach_strategies")[0]!)!;
    expect(row).toMatchObject({ workspace_id: "w1", prospect_id: "p1", cta: DRAFT.cta });
  });

  it("records a succeeded ledger row at the reasoning tier", async () => {
    mockDb();

    await generateOutreachStrategy("p1", null);

    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "generate_outreach_strategy",
        model: "claude-reasoning",
        status: "succeeded",
      }),
    );
  });

  it("normalizes a provider failure, records it, and persists nothing", async () => {
    const supabase = mockDb();
    h.generateObject.mockRejectedValue(new Error("boom"));

    await expect(generateOutreachStrategy("p1", null)).rejects.toThrow("normalized");
    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(supabase.queries("outreach_strategies")).toEqual([]);
  });

  it("propagates a failed persist", async () => {
    mockDb(null, new Error("insert denied"));

    await expect(generateOutreachStrategy("p1", null)).rejects.toThrow();
  });
});

/**
 * The prompt is where "grounded in the research" either happens or doesn't. These assert
 * the substitutions the model actually reads, including the fallbacks for the fields a
 * thin prospect leaves empty — a prompt that silently renders "undefined" or an empty
 * line is how a strategy ends up generic.
 */
describe("generateOutreachStrategy — prompt grounding", () => {
  const prompt = () => String(h.generateObject.mock.calls[0]![0].prompt);

  it("names the chosen contact and their role", async () => {
    mockDb({ id: "c1", first_name: "Sarah", last_name: "Miller", job_title: "VP Engineering" });

    await generateOutreachStrategy("p1", "c1");

    expect(prompt()).toContain("Targeting contact: Sarah Miller, VP Engineering.");
  });

  it("copes with a contact whose name was never captured", async () => {
    mockDb({ id: "c1", first_name: null, last_name: null, job_title: null });

    await generateOutreachStrategy("p1", "c1");

    expect(prompt()).toContain("Targeting contact: (name unknown).");
  });

  it("writes for the ICP's buyer role when no contact was chosen", async () => {
    mockDb();

    await generateOutreachStrategy("p1", null);

    expect(prompt()).toContain("No specific contact selected yet");
  });

  it("includes the prospect's industry when it is known", async () => {
    mockDb();
    h.getProspect.mockResolvedValue({ id: "p1", workspace_id: "w1", company_name: "Acme", industry: "Manufacturing" });

    await generateOutreachStrategy("p1", null);

    expect(prompt()).toContain("Prospect: Acme (Manufacturing).");
  });

  it("carries the fit score and its reasoning when the prospect has been scored", async () => {
    mockDb();
    h.getProspectScore.mockResolvedValue({ overall_score: 84, reasoning: "Strong ICP match" });

    await generateOutreachStrategy("p1", null);

    expect(prompt()).toContain("Fit score: 84/100 (Strong ICP match)");
  });

  it("carries a score that has no recorded reasoning", async () => {
    mockDb();
    h.getProspectScore.mockResolvedValue({ overall_score: 84, reasoning: null });

    await generateOutreachStrategy("p1", null);

    expect(prompt()).toContain("Fit score: 84/100 ()");
  });

  it("says so explicitly where the research found nothing", async () => {
    mockDb();
    h.getProspectResearch.mockResolvedValue({
      summary: null,
      pain_points: [],
      buying_signals: [],
      recent_events: [],
      recommended_angle: null,
      evidence: [],
    });
    h.getIcpProfile.mockResolvedValue({ ...ICP, roles: [] });

    await generateOutreachStrategy("p1", null);

    expect(prompt()).toContain("Summary: none");
    expect(prompt()).toContain("Pain points: none found");
    expect(prompt()).toContain("Buying signals: none found");
    expect(prompt()).toContain("Recent events: none found");
    expect(prompt()).toContain("Typical buyer roles: not specified");
  });
});
