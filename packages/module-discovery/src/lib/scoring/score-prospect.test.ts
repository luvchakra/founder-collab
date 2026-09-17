/**
 * Scoring is deliberately deterministic — no AI call, per blueprint §17's "AI should not
 * unnecessarily calculate simple mathematics". That makes the arithmetic itself the
 * contract: the 50/25/25 weighting, how a missing research row is scored, and the fuzzy
 * matching that decides ICP fit. It is also append-only (R8): a rescore is a new row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getProspect: vi.fn(),
  getWorkspace: vi.fn(),
  getIcpProfile: vi.fn(),
  getProspectResearch: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({ getWorkspace: h.getWorkspace }));
vi.mock("../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../research/queries", () => ({ getProspectResearch: h.getProspectResearch }));

const { WEIGHTS, scoreProspect } = await import("./score-prospect");

const PROSPECT = {
  id: "p1",
  workspace_id: "w1",
  industry: "Manufacturing",
  company_size: "50-200",
  location: "India",
};
const ICP = {
  status: "approved",
  industries: ["Manufacturing"],
  company_sizes: ["50-200"],
  geographies: ["India"],
};

function mock() {
  const supabase = createFakeSupabase({ query: () => ({ data: { id: "score-1" }, error: null }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

/** Runs a score and returns the row that was written, with `reasoning` split back into
 * lines — it is persisted as one newline-joined string. */
async function score() {
  const supabase = mock();
  await scoreProspect("p1");
  const row = writtenRow(supabase.queries("prospect_scores")[0]!) as Record<string, unknown>;
  return { ...row, reasoning: String(row.reasoning).split("\n") } as Record<string, number | string[]>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProspect.mockResolvedValue(PROSPECT);
  h.getWorkspace.mockResolvedValue({ id: "w1" });
  h.getIcpProfile.mockResolvedValue(ICP);
  h.getProspectResearch.mockResolvedValue(null);
});

describe("scoreProspect — guards", () => {
  it("refuses a prospect that is not visible", async () => {
    h.getProspect.mockResolvedValue(null);
    await expect(scoreProspect("p1")).rejects.toThrow("Prospect not found.");
  });

  it("refuses when the workspace cannot be resolved", async () => {
    h.getWorkspace.mockResolvedValue(null);
    await expect(scoreProspect("p1")).rejects.toThrow("Workspace not found.");
  });

  it.each([
    ["no ICP at all", null],
    ["a draft ICP", { ...ICP, status: "draft" }],
  ])("refuses to score against %s", async (_label, icp) => {
    h.getIcpProfile.mockResolvedValue(icp);

    await expect(scoreProspect("p1")).rejects.toThrow("Approve an ICP before scoring prospects.");
  });
});

describe("scoreProspect — ICP fit", () => {
  it("scores 100 when every dimension matches", async () => {
    expect((await score()).icp_score).toBe(100);
  });

  it("scores 0 when none match", async () => {
    h.getIcpProfile.mockResolvedValue({
      status: "approved",
      industries: ["Retail"],
      company_sizes: ["1000+"],
      geographies: ["US"],
    });

    expect((await score()).icp_score).toBe(0);
  });

  it("scores a partial match proportionally", async () => {
    h.getIcpProfile.mockResolvedValue({ ...ICP, geographies: ["US"] });

    expect((await score()).icp_score).toBe(67);
  });

  it("matches fuzzily in both directions, so 'Manufacturing' fits 'Industrial Manufacturing'", async () => {
    h.getIcpProfile.mockResolvedValue({ ...ICP, industries: ["Industrial Manufacturing"] });
    expect((await score()).icp_score).toBe(100);

    h.getProspect.mockResolvedValue({ ...PROSPECT, industry: "Industrial Manufacturing" });
    h.getIcpProfile.mockResolvedValue(ICP);
    expect((await score()).icp_score).toBe(100);
  });

  it("matches case-insensitively", async () => {
    h.getProspect.mockResolvedValue({ ...PROSPECT, industry: "MANUFACTURING" });

    expect((await score()).icp_score).toBe(100);
  });

  it("treats an unset prospect field as a non-match", async () => {
    h.getProspect.mockResolvedValue({ ...PROSPECT, industry: null });

    expect((await score()).icp_score).toBe(67);
  });

  it("explains each dimension in the reasoning", async () => {
    h.getIcpProfile.mockResolvedValue({ ...ICP, geographies: ["US"] });

    const reasoning = (await score()).reasoning as string[];

    expect(reasoning.some((r) => r.startsWith("+") && r.includes("Industry"))).toBe(true);
    expect(reasoning.some((r) => r.startsWith("-") && r.includes("Location"))).toBe(true);
  });

  it("names an unset field explicitly in the reasoning", async () => {
    h.getProspect.mockResolvedValue({ ...PROSPECT, company_size: null });

    expect((await score()).reasoning as string[]).toContainEqual(
      expect.stringContaining("Company size (unset)"),
    );
  });
});

describe("scoreProspect — intent and timing", () => {
  it("scores both zero with no research, and says why", async () => {
    const row = await score();

    expect(row.intent_score).toBe(0);
    expect(row.timing_score).toBe(0);
    expect(row.reasoning as string[]).toContainEqual(expect.stringContaining("No research yet"));
  });

  it("scores 25 per buying signal and per recent event", async () => {
    h.getProspectResearch.mockResolvedValue({ buying_signals: ["a", "b"], recent_events: ["x"] });

    const row = await score();

    expect(row.intent_score).toBe(50);
    expect(row.timing_score).toBe(25);
  });

  it("caps both at 100", async () => {
    h.getProspectResearch.mockResolvedValue({
      buying_signals: ["a", "b", "c", "d", "e"],
      recent_events: ["a", "b", "c", "d", "e"],
    });

    const row = await score();

    expect(row.intent_score).toBe(100);
    expect(row.timing_score).toBe(100);
  });

  it("distinguishes 'researched, found nothing' from 'not researched'", async () => {
    h.getProspectResearch.mockResolvedValue({ buying_signals: [], recent_events: [] });

    const reasoning = (await score()).reasoning as string[];

    expect(reasoning).toContainEqual(expect.stringContaining("No buying signals found in research"));
    expect(reasoning).not.toContainEqual(expect.stringContaining("No research yet"));
  });
});

describe("scoreProspect — overall", () => {
  it("weights ICP 50%, intent 25%, timing 25%", async () => {
    expect(WEIGHTS).toEqual({ icp: 0.5, intent: 0.25, timing: 0.25 });
  });

  it("combines the three into the overall score", async () => {
    h.getProspectResearch.mockResolvedValue({ buying_signals: ["a"], recent_events: ["x"] });

    const row = await score();

    // 100*0.5 + 25*0.25 + 25*0.25 = 62.5 -> 63
    expect(row.overall_score).toBe(63);
  });

  it("scores zero overall when nothing matches and there is no research", async () => {
    h.getIcpProfile.mockResolvedValue({
      status: "approved",
      industries: [],
      company_sizes: [],
      geographies: [],
    });

    expect((await score()).overall_score).toBe(0);
  });

  it("appends a new row rather than overwriting the previous score (R8)", async () => {
    const supabase = mock();

    await scoreProspect("p1");

    const call = supabase.queries("prospect_scores")[0]!;
    expect(call.ops.some((op) => op.method === "insert")).toBe(true);
    expect(call.ops.some((op) => op.method === "update" || op.method === "upsert")).toBe(false);
  });

  it("denormalizes the overall score onto the prospect, for list sorting", async () => {
    const supabase = mock();

    await scoreProspect("p1");

    // ICP 100 * 0.5, with no research contributing intent or timing.
    expect(writtenRow(supabase.queries("prospects")[0]!)).toEqual({ fit_score: 50 });
  });

  it("propagates a failed write", async () => {
    const supabase = createFakeSupabase({ query: () => ({ data: null, error: new Error("denied") }) });
    h.createClient.mockResolvedValue(supabase);

    await expect(scoreProspect("p1")).rejects.toThrow("denied");
  });

  it("says 'unset' in the reasoning for the prospect fields it has no value for", async () => {
    const supabase = mock();
    h.getProspect.mockResolvedValue({
      id: "p1",
      workspace_id: "w1",
      company_name: "Acme",
      industry: null,
      company_size: null,
      location: null,
    });

    await scoreProspect("p1");

    const reasoning = String(writtenRow(supabase.queries("prospect_scores")[0]!)!.reasoning);
    expect(reasoning).toContain("Company size (unset)");
    expect(reasoning).toContain("Location (unset)");
  });
});
