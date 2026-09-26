// EXP-MKT-01 -- Marketing dashboard export: the page's figures, campaigns, funnel and
// attention list, tenant-scoped, with unreported figures left blank.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingContent } from "../../lib/marketing/types";

const h = vi.hoisted(() => ({
  listCampaignsForExport: vi.fn(),
  listCampaignMetricsForExport: vi.fn(),
  listContentForExport: vi.fn(),
  listOfferingOptions: vi.fn(),
}));
vi.mock("./queries", () => ({
  listCampaignsForExport: h.listCampaignsForExport,
  listCampaignMetricsForExport: h.listCampaignMetricsForExport,
  listContentForExport: h.listContentForExport,
}));
vi.mock("../../lib/marketing/queries", () => ({ listOfferingOptions: h.listOfferingOptions }));

import { marketingDashboardExport } from "./dashboard";
import { BUSINESS_ID, OFFERING, allCellText, campaign, exportContext, headers, metric, params, renderText, rowValues, sheet } from "./test-support";

const CONTENT: MarketingContent[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  h.listCampaignsForExport.mockResolvedValue([campaign()]);
  h.listCampaignMetricsForExport.mockResolvedValue([metric()]);
  h.listContentForExport.mockResolvedValue(CONTENT);
  h.listOfferingOptions.mockResolvedValue([{ id: OFFERING, name: "Payroll suite" }]);
});

describe("EXP-MKT-01 marketing.dashboard", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingDashboardExport.id).toBe("marketing.dashboard");
    expect(marketingDashboardExport.module).toBe("discovery");
    expect(marketingDashboardExport.permissions).toEqual(["marketing.view"]);
  });

  it("reads only the context's business, whatever tenant ids the request carries", async () => {
    const filters = marketingDashboardExport.parseFilters!(params({ period: "90d", offering: OFFERING, extra: "x" }));
    expect(filters).toEqual({ period: "90d", offeringId: OFFERING });
    await marketingDashboardExport.load(exportContext(), filters);
    expect(h.listCampaignsForExport).toHaveBeenCalledWith(BUSINESS_ID, { offeringId: OFFERING });
    expect(h.listContentForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listCampaignMetricsForExport).toHaveBeenCalledWith(BUSINESS_ID, expect.objectContaining({ from: expect.any(String) }), ["c-1"]);
  });

  it("falls back to the page's defaults for unknown values", () => {
    expect(marketingDashboardExport.parseFilters!(params({ period: "7y", offering: "not-a-uuid" }))).toEqual({ period: "30d", offeringId: undefined });
  });

  it("exports Summary, Campaigns, Funnel and Attention, with labels and blank unreported figures", async () => {
    const wb = await marketingDashboardExport.load(exportContext(), marketingDashboardExport.parseFilters!(params()));
    expect(wb.sheets.map((s) => s.sheetName)).toEqual(["Summary", "Campaigns", "Funnel", "Attention"]);
    expect(wb.csvSheet).toBe("Campaigns");
    expect(headers(wb, "Summary")).toEqual(["Metric", "Value", "Unit", "Currency", "Reported", "How calculated"]);
    expect(headers(wb, "Campaigns")).toEqual([
      "Campaign", "Offering", "Channel", "Objective", "Status", "Spend", "Leads", "Qualified leads", "Opportunities",
      "Customers", "Revenue", "Lead to customer", "Currency", "Last activity",
    ]);
    const row = rowValues(wb, "Campaigns");
    expect(row).toMatchObject({ Campaign: "Spring launch", Channel: "Paid social", Objective: "Lead generation", Status: "Active", Leads: 12, Customers: 2 });
    // Spend was never reported: blank, not 0 (§46).
    expect(row.Spend).toBeNull();
    expect(row["Qualified leads"]).toBeNull();
    expect(row["Lead to customer"]).toBeCloseTo(2 / 12);

    const spend = (sheet(wb, "Summary").rows as { label: string; value: number | null }[]).find((r) => r.label === "Spend");
    expect(spend?.value).toBeNull();
    const csv = await renderText(wb);
    expect(csv).toContain("Spring launch,Payroll suite,Paid social,Lead generation,Active,,12,,,2,");
  });

  it("writes the funnel with counts and conversions where both ends were reported", async () => {
    const wb = await marketingDashboardExport.load(exportContext(), marketingDashboardExport.parseFilters!(params()));
    expect(rowValues(wb, "Funnel", 0)).toEqual({ Stage: "Traffic", Count: 300, "Conversion from previous stage": null });
    expect(rowValues(wb, "Funnel", 1)).toMatchObject({ Stage: "Engagement", Count: null });
  });

  it("keeps money blank and says why when snapshots mix currencies", async () => {
    h.listCampaignMetricsForExport.mockResolvedValue([metric({ spend: 100, currency: "INR" }), metric({ spend: 5, currency: "USD" })]);
    const wb = await marketingDashboardExport.load(exportContext(), marketingDashboardExport.parseFilters!(params()));
    expect(rowValues(wb, "Campaigns")).toMatchObject({ Spend: null, Currency: "Mixed (INR, USD)" });
    expect(wb.metadata?.Note).toMatch(/more than one currency/);
  });

  it("produces a valid, header-only workbook when nothing matches", async () => {
    h.listCampaignsForExport.mockResolvedValue([]);
    h.listCampaignMetricsForExport.mockResolvedValue([]);
    const wb = await marketingDashboardExport.load(exportContext(), marketingDashboardExport.parseFilters!(params()));
    expect(sheet(wb, "Campaigns").rows).toHaveLength(0);
    expect(allCellText(wb)).not.toContain(BUSINESS_ID);
  });
});
