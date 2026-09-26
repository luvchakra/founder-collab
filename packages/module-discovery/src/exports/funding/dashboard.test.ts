// EXP-FND-01 -- Funding dashboard export: the page's figures with their kind and source,
// round progress, funnel, readiness, diligence and attention; Finance only through the
// contract, blank with a reason when unavailable.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  listRounds: vi.fn(),
  getFundingProfile: vi.fn(),
  listInvestors: vi.fn(),
  listPipeline: vi.fn(),
  listStageHistory: vi.fn(),
  listOutreach: vi.fn(),
  listReadinessItems: vi.fn(),
  listDataRoomItems: vi.fn(),
  listDiligence: vi.fn(),
  listInteractions: vi.fn(),
  getFundingFinanceSnapshot: vi.fn(),
}));
vi.mock("../../lib/funding/queries", async () => {
  const pickActiveRound = (rounds: { status: string; isPrimary: boolean }[]) =>
    rounds.filter((r) => ["open", "paused", "planning"].includes(r.status)).find((r) => r.isPrimary) ?? null;
  return { ...h, pickActiveRound };
});
vi.mock("@cofounderai/module-gst/contract/index", () => ({ getFundingFinanceSnapshot: h.getFundingFinanceSnapshot }));

import { fundingDashboardExport } from "./dashboard";
import { BUSINESS_ID, ROUND_ID, exportContext, headers, params, pipelineRecord, renderText, round, rowValues, sheet } from "./test-support";

type Figure = { label: string; value: number | null; kind: string; source: string };
const figures = (wb: Awaited<ReturnType<typeof fundingDashboardExport.load>>) =>
  new Map((sheet(wb, "Summary").rows as Figure[]).map((r) => [r.label, r]));

beforeEach(() => {
  vi.clearAllMocks();
  h.listRounds.mockResolvedValue([round()]);
  h.getFundingProfile.mockResolvedValue(null);
  h.listInvestors.mockResolvedValue([]);
  h.listPipeline.mockResolvedValue([
    pipelineRecord(),
    pipelineRecord({ id: "pl-2", investorId: "i-2", stage: "committed", committedAmount: 1_500_000 }),
  ]);
  h.listStageHistory.mockResolvedValue([]);
  h.listOutreach.mockResolvedValue([]);
  h.listReadinessItems.mockResolvedValue([]);
  h.listDataRoomItems.mockResolvedValue([]);
  h.listDiligence.mockResolvedValue([]);
  h.listInteractions.mockResolvedValue([]);
  h.getFundingFinanceSnapshot.mockResolvedValue({ ok: false, error: "MODULE_NOT_LICENSED" });
});

describe("EXP-FND-01 funding.dashboard", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingDashboardExport.id).toBe("funding.dashboard");
    expect(fundingDashboardExport.module).toBe("discovery");
    expect(fundingDashboardExport.permissions).toEqual(["funding.view"]);
  });

  it("reads only the context's business, whatever the request carries", async () => {
    expect(fundingDashboardExport.parseFilters!(params({ round: ROUND_ID }))).toEqual({});
    await fundingDashboardExport.load(exportContext(), {});
    for (const fn of Object.values(h)) {
      if (fn.mock.calls.length > 0) expect(fn.mock.calls[0]?.[0]).toBe(BUSINESS_ID);
    }
    expect(h.listPipeline).toHaveBeenCalledWith(BUSINESS_ID, { roundId: ROUND_ID });
  });

  it("exports every dashboard dataset with kind and source next to each figure", async () => {
    const wb = await fundingDashboardExport.load(exportContext(), {});
    expect(wb.sheets.map((s) => s.sheetName)).toEqual(["Summary", "Round", "Investor Funnel", "Readiness", "Diligence", "Attention"]);
    expect(headers(wb, "Summary")).toEqual(["Metric", "Value", "Currency", "Kind of figure", "Source", "How calculated"]);
    const f = figures(wb);
    expect(f.get("Target")).toMatchObject({ value: 10_000_000, kind: "User-entered" });
    expect(f.get("Committed")).toMatchObject({ value: 1_500_000, kind: "User-entered" });
    // Nothing has been received: raised is blank, not 0.
    expect(f.get("Raised")).toMatchObject({ value: null, kind: "Actual" });
    expect(rowValues(wb, "Round")).toMatchObject({ Round: "Seed 2026", Type: "Seed", Status: "Open", Target: 10_000_000, Raised: null, Currency: "INR" });
    expect(rowValues(wb, "Investor Funnel", 4)).toMatchObject({ Stage: "Meeting", "Currently at stage": 1 });
    expect(rowValues(wb, "Diligence", 0)).toEqual({ Status: "Open", Requests: 0 });
    expect(sheet(wb, "Attention").rows.length).toBeGreaterThan(0);
    expect(rowValues(wb, "Attention")).toMatchObject({ "How it was produced": "Rule-based" });
    // The whole workbook renders as a real .xlsx (a zip).
    expect((await renderText(wb, "xlsx")).startsWith("PK")).toBe(true);
  });

  it("leaves Finance blank and says why when Finance is not licensed", async () => {
    const f = figures(await fundingDashboardExport.load(exportContext(), {}));
    expect(f.get("Cash")).toMatchObject({ value: null, kind: "Finance-derived", source: "Finance unavailable: not licensed for this business" });
    expect(f.get("Runway (months)")?.value).toBeNull();
  });

  it("carries Finance figures with the time they were read when Finance is available", async () => {
    h.getFundingFinanceSnapshot.mockResolvedValue({
      ok: true,
      data: { asOf: "2026-09-26T05:00:00Z", currency: "INR", cash: 900000, receivable: 0, payable: 0, revenueLast3Months: 300000, averageMonthlyNet: -50000, netBurn: 50000, runwayMonths: 18, hasAccounts: true },
    });
    const f = figures(await fundingDashboardExport.load(exportContext(), {}));
    expect(f.get("Cash")).toMatchObject({ value: 900000, kind: "Finance-derived", source: "Finance ledger, read 2026-09-26T05:00:00Z" });
    expect(f.get("Receivables")?.value).toBe(0); // a reported zero stays zero
    expect(f.get("Runway (months)")?.value).toBe(18);
  });

  it("is a valid workbook with no live round", async () => {
    h.listRounds.mockResolvedValue([]);
    const wb = await fundingDashboardExport.load(exportContext(), {});
    expect(sheet(wb, "Round").rows).toHaveLength(0);
    expect(sheet(wb, "Investor Funnel").rows).toHaveLength(0);
    expect(h.listPipeline).not.toHaveBeenCalled();
    expect(wb.metadata?.Round).toBe("No live round");
  });
});
