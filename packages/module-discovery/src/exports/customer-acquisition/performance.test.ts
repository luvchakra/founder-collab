// EXP-DISC-11 -- Offering Performance export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOREIGN_WORKSPACE_ID, OTHER_BUSINESS_ID, WORKSPACE_ID, headersOf, makeContext, makeProduct, makeWorkspace, rowsOf, sheetNames, tamperedParams } from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getPerformanceAnalysisRawDataForExport: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("./queries", () => ({ getPerformanceAnalysisRawDataForExport: h.getPerformanceAnalysisRawDataForExport }));

const { discoveryPerformanceExport: adapter } = await import("./performance");

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.getPerformanceAnalysisRawDataForExport.mockResolvedValue({
    prospects: [
      { id: "p1", company_name: "Globex", industry: "Logistics", location: "Pune", fit_score: 80, outcome: "won" },
      { id: "p2", company_name: "Initech", industry: "Logistics", location: null, fit_score: null, outcome: "open" },
      { id: "p3", company_name: "Umbrella", industry: "Retail", location: "Pune", fit_score: 30, outcome: "lost" },
    ],
    signals: [{ id: "s1", prospect_id: "p1", signal_type: "buying_signal", description: "Hiring ops leads", source: null, observed_at: "2026-09-01T00:00:00Z" }],
    conversations: [{ id: "c1", prospect_id: "p1", contact_id: "k1", channel: "email", status: "replied" }],
    contacts: [{ id: "k1", job_title: "Head of Ops" }],
  });
});

describe("discovery.performance (EXP-DISC-11)", () => {
  it("is the Discovery-licensed performance export", () => {
    expect(adapter.id).toBe("discovery.performance");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("reads the verified workspace only", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(h.getPerformanceAnalysisRawDataForExport).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(h.getPerformanceAnalysisRawDataForExport).not.toHaveBeenCalledWith(FOREIGN_WORKSPACE_ID);
  });

  it("refuses an offering from another business", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()))).rejects.toMatchObject({ status: 404 });
    expect(h.getPerformanceAnalysisRawDataForExport).not.toHaveBeenCalled();
  });

  it("exports every calculated rate with its counts, and the evidence rows behind them", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(sheetNames(workbook)).toEqual(["Analysis", "Prospects", "Signals", "Conversations"]);
    expect(headersOf(workbook, "Analysis")).toEqual(["Question", "Group", "Total", "Counted as success", "Successes", "Rate", "Basis"]);

    const analysis = rowsOf(workbook, "Analysis");
    expect(analysis).toContainEqual({ Question: "Which industries convert?", Group: "Logistics", Total: 2, "Counted as success": "Won", Successes: 1, Rate: 0.5, Basis: "Calculated" });
    expect(analysis).toContainEqual(expect.objectContaining({ Question: "Which buyer roles respond?", Group: "Head of Ops", Rate: 1 }));
    // An empty score bucket has no rate -- blank, not 0%.
    expect(analysis).toContainEqual(expect.objectContaining({ Question: "Does a higher fit score mean better outcomes?", Group: "51-75", Total: 0, Rate: null }));

    const prospects = rowsOf(workbook, "Prospects");
    expect(prospects[0]).toMatchObject({ Company: "Globex", Outcome: "Won", "Outcome basis": "Recorded" });
    expect(prospects[0]!["Fit score basis"]).toMatch(/Calculated/);
    expect(prospects[1]).toMatchObject({ "Fit score": null, "Fit score basis": null, Location: null });
    expect(rowsOf(workbook, "Signals")[0]).toMatchObject({ Company: "Globex", "Signal type": "Buying signal", "Prospect has a conversation": true, Basis: "AI-derived", Source: null });
    expect(rowsOf(workbook, "Conversations")[0]).toMatchObject({ Company: "Globex", "Contact job title": "Head of Ops", Channel: "Email", Status: "Needs response", Replied: true });
    expect(workbook.metadata?.["Not answered"]).toMatch(/Discovery Plays/);
  });
});
