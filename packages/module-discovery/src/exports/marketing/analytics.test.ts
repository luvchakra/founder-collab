// EXP-MKT-07 -- Marketing analytics export: the active report with every metric, the
// funnel and the time series; period and filters in the metadata; blanks stay blank.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listCampaignsForExport: vi.fn(), listCampaignMetricsForExport: vi.fn(), listOfferingOptions: vi.fn() }));
vi.mock("./queries", () => ({
  listCampaignsForExport: h.listCampaignsForExport,
  listCampaignMetricsForExport: h.listCampaignMetricsForExport,
}));
vi.mock("../../lib/marketing/queries", () => ({ listOfferingOptions: h.listOfferingOptions }));

import { marketingAnalyticsExport } from "./analytics";
import { BUSINESS_ID, OFFERING, campaign, exportContext, headers, metric, params, rowValues, sheet } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listCampaignsForExport.mockResolvedValue([campaign(), campaign({ id: "c-2", name: "Webinar", channel: "paid_social" })]);
  h.listCampaignMetricsForExport.mockResolvedValue([
    metric({ spend: 600, leads: 12, qualifiedLeads: 3 }),
    metric({ campaignId: "c-2", metricDate: "2026-09-21", leads: 0, spend: null }),
  ]);
  h.listOfferingOptions.mockResolvedValue([{ id: OFFERING, name: "Payroll suite" }]);
});

describe("EXP-MKT-07 marketing.analytics", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingAnalyticsExport.id).toBe("marketing.analytics");
    expect(marketingAnalyticsExport.module).toBe("discovery");
    expect(marketingAnalyticsExport.permissions).toEqual(["marketing.view"]);
  });

  it("applies the page's filters with the context's business", async () => {
    const filters = marketingAnalyticsExport.parseFilters!(params({ period: "90d", report: "channel", grain: "month", channel: "paid_social", offering: OFFERING }));
    expect(filters).toEqual({ period: "90d", report: "channel", grain: "month", channel: "paid_social", offeringId: OFFERING });
    await marketingAnalyticsExport.load(exportContext(), filters);
    expect(h.listCampaignsForExport).toHaveBeenCalledWith(BUSINESS_ID, { status: "all", channel: "paid_social", offeringId: OFFERING });
    expect(h.listCampaignMetricsForExport).toHaveBeenCalledWith(BUSINESS_ID, expect.any(Object), ["c-1", "c-2"]);
  });

  it("campaign report: every metric, cost ratios computed only from reported inputs", async () => {
    const wb = await marketingAnalyticsExport.load(exportContext(), marketingAnalyticsExport.parseFilters!(params()));
    expect(wb.sheets.map((s) => s.sheetName)).toEqual(["By campaign", "Funnel", "Over time"]);
    expect(headers(wb, "By campaign")).toEqual([
      "Campaign", "Spend", "Impressions", "Clicks", "Leads", "Qualified leads", "Opportunities", "Customers", "Revenue",
      "Cost per lead", "Cost per qualified lead", "Cost per opportunity", "Currency",
    ]);
    const spring = rowValues(wb, "By campaign", 0);
    expect(spring).toMatchObject({ Campaign: "Spring launch", Spend: 600, Leads: 12, "Cost per lead": 50, "Cost per qualified lead": 200 });
    expect(spring["Cost per opportunity"]).toBeNull();
    expect(spring.Impressions).toBeNull();
    const webinar = rowValues(wb, "By campaign", 1);
    expect(webinar).toMatchObject({ Campaign: "Webinar", Leads: 0, Spend: null, "Cost per lead": null });
    expect(wb.metadata).toMatchObject({ Report: "By campaign", Channel: "All channels", Offering: "All offerings", "Time series": "Weekly" });
    expect(wb.metadata?.Period).toMatch(/^Last 30 days \(\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}\)$/);
  });

  it("channel and offering reports carry a campaign count", async () => {
    const byChannel = await marketingAnalyticsExport.load(exportContext(), marketingAnalyticsExport.parseFilters!(params({ report: "channel" })));
    expect(rowValues(byChannel, "By channel")).toMatchObject({ Channel: "Paid social", Campaigns: 2, Leads: 12 });
    const byOffering = await marketingAnalyticsExport.load(exportContext(), marketingAnalyticsExport.parseFilters!(params({ report: "offering" })));
    expect(rowValues(byOffering, "By offering")).toMatchObject({ Offering: "Payroll suite", Campaigns: 2 });
  });

  it("time series at the chosen grain, with unreported buckets blank", async () => {
    const wb = await marketingAnalyticsExport.load(exportContext(), marketingAnalyticsExport.parseFilters!(params({ grain: "day" })));
    expect(headers(wb, "Over time")[0]).toBe("Day");
    expect(sheet(wb, "Over time").rows).toHaveLength(2);
    expect(rowValues(wb, "Over time", 1)).toMatchObject({ Day: "2026-09-21", Leads: 0, "Qualified leads": null });
  });

  it("an empty period exports headers only", async () => {
    h.listCampaignMetricsForExport.mockResolvedValue([]);
    const wb = await marketingAnalyticsExport.load(exportContext(), marketingAnalyticsExport.parseFilters!(params()));
    expect(sheet(wb, "Funnel").rows).toHaveLength(0);
    expect(sheet(wb, "Over time").rows).toHaveLength(0);
    expect(rowValues(wb, "By campaign")).toMatchObject({ Spend: null, Leads: null });
  });
});
