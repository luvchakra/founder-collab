// EXP-FND-10 -- Funding analytics export: the selected round (only among this
// business's rounds) and grain, every analytics dataset as its own sheet.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  listRounds: vi.fn(),
  listInvestors: vi.fn(),
  listPipeline: vi.fn(),
  listStageHistory: vi.fn(),
  listInteractions: vi.fn(),
  listOutreach: vi.fn(),
  listReadinessItems: vi.fn(),
  listDataRoomItems: vi.fn(),
  listShares: vi.fn(),
  listDiligence: vi.fn(),
}));
vi.mock("../../lib/funding/queries", () => ({
  ...h,
  pickActiveRound: (rounds: { status: string; isPrimary: boolean }[]) => rounds.find((r) => r.status === "open" && r.isPrimary) ?? null,
}));

import { fundingAnalyticsExport } from "./analytics";
import { BUSINESS_ID, ROUND_ID, exportContext, headers, investor, params, pipelineRecord, renderText, round, rowValues, sheet } from "./test-support";

const CLOSED = "77777777-7777-4777-8777-777777777770";
const FOREIGN = "12121212-1212-4212-8212-121212121212";

beforeEach(() => {
  vi.clearAllMocks();
  h.listRounds.mockResolvedValue([round(), round({ id: CLOSED, name: "Pre-seed", status: "closed", isPrimary: false })]);
  h.listInvestors.mockResolvedValue([investor()]);
  h.listPipeline.mockResolvedValue([pipelineRecord({ stage: "committed", committedAmount: 500_000 })]);
  h.listStageHistory.mockResolvedValue([
    { pipelineId: "pl-1", fromStage: null, toStage: "contacted", changedAt: "2026-09-01T00:00:00Z" },
    { pipelineId: "pl-1", fromStage: "contacted", toStage: "committed", changedAt: "2026-09-15T00:00:00Z" },
  ]);
  h.listInteractions.mockResolvedValue([
    { id: "m-1", investorId: "i-1", investorName: "Blue Fund", contactId: null, roundId: ROUND_ID, interactionType: "meeting", occurredAt: "2026-09-05T00:00:00Z", subject: "First call", notes: null, outcome: "Good", nextAction: null, nextActionDue: null, source: "manual" },
  ]);
  h.listOutreach.mockResolvedValue([{ status: "sent", sentAt: "2026-09-02T00:00:00Z" }, { status: "replied", sentAt: "2026-09-02T00:00:00Z" }, { status: "draft", sentAt: null }]);
  h.listReadinessItems.mockResolvedValue([]);
  h.listDataRoomItems.mockResolvedValue([]);
  h.listShares.mockResolvedValue([]);
  h.listDiligence.mockResolvedValue([]);
});

describe("EXP-FND-10 funding.analytics", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingAnalyticsExport.id).toBe("funding.analytics");
    expect(fundingAnalyticsExport.module).toBe("discovery");
    expect(fundingAnalyticsExport.permissions).toEqual(["funding.view"]);
  });

  it("uses the selected round only when it is one of this business's rounds", async () => {
    await fundingAnalyticsExport.load(exportContext(), fundingAnalyticsExport.parseFilters!(params({ round: CLOSED })));
    expect(h.listPipeline).toHaveBeenCalledWith(BUSINESS_ID, { roundId: CLOSED });
    h.listPipeline.mockClear();
    const wb = await fundingAnalyticsExport.load(exportContext(), fundingAnalyticsExport.parseFilters!(params({ round: FOREIGN })));
    expect(h.listPipeline).toHaveBeenCalledWith(BUSINESS_ID, { roundId: ROUND_ID });
    expect(wb.metadata?.Round).toBe("Seed 2026");
    for (const fn of Object.values(h)) expect(fn.mock.calls[0]?.[0]).toBe(BUSINESS_ID);
  });

  it("exports every analytics dataset", async () => {
    const wb = await fundingAnalyticsExport.load(exportContext(), fundingAnalyticsExport.parseFilters!(params({ grain: "month" })));
    expect(wb.sheets.map((s) => s.sheetName)).toEqual([
      "Funnel", "Source", "Pipeline Trend", "Round Progress", "Meetings", "Outreach", "Readiness", "Diligence", "Data room",
    ]);
    expect(rowValues(wb, "Funnel", 3)).toMatchObject({ Stage: "Contacted", "Reached (from stage history)": 1, "Median days in stage": 14 });
    expect(rowValues(wb, "Source")).toEqual({ Source: "Founder network", Investors: 1, "In pipeline": 1, Committed: 1 });
    expect(headers(wb, "Pipeline Trend")).toEqual(["Month", "Contacted", "Meeting", "Due diligence", "Term discussion", "Committed", "Invested"]);
    expect(rowValues(wb, "Pipeline Trend")).toMatchObject({ Month: "2026-09", Contacted: 1, Committed: 1, Meeting: 0 });
    expect(rowValues(wb, "Round Progress")).toMatchObject({ Round: "Seed 2026", Committed: 500_000, Raised: null });
    expect(rowValues(wb, "Meetings")).toMatchObject({ Investor: "Blue Fund", Subject: "First call" });
    expect(sheet(wb, "Outreach").rows).toEqual([
      { label: "Outreach sent", value: 2 },
      { label: "Replies", value: 1 },
      { label: "Reply rate (share of sent)", value: 0.5 },
    ]);
    expect(rowValues(wb, "Readiness", 4)).toMatchObject({ Value: null }); // nothing to measure: blank, not 0%
    expect((await renderText(wb, "xlsx")).startsWith("PK")).toBe(true);
  });

  it("exports empty datasets when the business has no round", async () => {
    h.listRounds.mockResolvedValue([]);
    const wb = await fundingAnalyticsExport.load(exportContext(), fundingAnalyticsExport.parseFilters!(params()));
    expect(sheet(wb, "Round Progress").rows).toHaveLength(0);
    expect(sheet(wb, "Funnel").rows).toHaveLength(0);
    expect(wb.metadata?.Round).toBe("No round yet");
  });
});
