// EXP-MKT-03 -- Campaign list export: the list's own filters, every matching campaign,
// the 12-month performance columns with unreported figures blank.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listCampaignsForExport: vi.fn(), listCampaignMetricsForExport: vi.fn() }));
vi.mock("./queries", () => ({
  listCampaignsForExport: h.listCampaignsForExport,
  listCampaignMetricsForExport: h.listCampaignMetricsForExport,
}));

import { marketingCampaignsExport } from "./campaigns";
import { BUSINESS_ID, OFFERING, campaign, exportContext, headers, metric, params, renderText, rowValues, sheet } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listCampaignsForExport.mockResolvedValue([campaign(), campaign({ id: "c-2", name: "Quiet one", status: "draft", budget: null, offeringId: null, offeringName: null })]);
  h.listCampaignMetricsForExport.mockResolvedValue([metric({ spend: 1200.5, revenue: 0 })]);
});

describe("EXP-MKT-03 marketing.campaigns", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingCampaignsExport.id).toBe("marketing.campaigns");
    expect(marketingCampaignsExport.module).toBe("discovery");
    expect(marketingCampaignsExport.permissions).toEqual(["marketing.view"]);
  });

  it("passes the page's filters, and only the context's business, to the query", async () => {
    const filters = marketingCampaignsExport.parseFilters!(params({ status: "active", channel: "linkedin", offering: OFFERING, sort: "name", junk: "1" }));
    expect(filters).toEqual({ status: "active", channel: "linkedin", offeringId: OFFERING, sort: "name" });
    await marketingCampaignsExport.load(exportContext(), filters);
    expect(h.listCampaignsForExport).toHaveBeenCalledWith(BUSINESS_ID, filters);
    expect(h.listCampaignMetricsForExport).toHaveBeenCalledWith(BUSINESS_ID, expect.any(Object), ["c-1", "c-2"]);
    expect(marketingCampaignsExport.describeFilters!(filters)).toMatchObject({ Status: "Active", Channel: "LinkedIn", Sort: "Name" });
  });

  it("defaults unknown filter values the way the page does", () => {
    expect(marketingCampaignsExport.parseFilters!(params({ status: "bogus", channel: "fax", sort: "random" }))).toEqual({
      status: "all",
      channel: "all",
      offeringId: undefined,
      sort: "newest",
    });
  });

  it("exports the list's fields with labels, and leaves unreported figures blank", async () => {
    const wb = await marketingCampaignsExport.load(exportContext(), marketingCampaignsExport.parseFilters!(params()));
    expect(headers(wb, "Campaigns")).toEqual([
      "Campaign", "Status", "Objective", "Offering", "Channel", "Budget", "Budget currency", "Start", "End", "Spend", "Leads",
      "Qualified leads", "Opportunities", "Customers", "Revenue", "Lead to customer", "Currency", "Last recorded result",
      "Landing page", "Created",
    ]);
    expect(rowValues(wb, "Campaigns", 0)).toMatchObject({
      Campaign: "Spring launch",
      Status: "Active",
      Objective: "Lead generation",
      Channel: "Paid social",
      Budget: 50000,
      Spend: 1200.5,
      Revenue: 0, // a reported zero stays a zero
      "Qualified leads": null, // unreported stays blank
      Currency: "INR",
    });
    const quiet = rowValues(wb, "Campaigns", 1);
    expect(quiet).toMatchObject({ Offering: "Company-wide", Status: "Draft", Budget: null, Spend: null, Leads: null, "Last recorded result": null });
    const csv = await renderText(wb);
    expect(csv.split("\r\n")[2]).toMatch(/^Quiet one,Draft,Lead generation,Company-wide,Paid social,,,2026-09-01,2026-12-31,,,,,,,,INR,,/);
    expect(wb.metadata?.["Results window"]).toMatch(/^Last 12 months/);
  });

  it("writes a header-only file when nothing matches", async () => {
    h.listCampaignsForExport.mockResolvedValue([]);
    h.listCampaignMetricsForExport.mockResolvedValue([]);
    const wb = await marketingCampaignsExport.load(exportContext(), marketingCampaignsExport.parseFilters!(params({ status: "archived" })));
    expect(sheet(wb, "Campaigns").rows).toHaveLength(0);
    expect((await renderText(wb)).trim().split("\r\n")).toHaveLength(1);
  });
});
