// EXP-MKT-05 -- Content export: list and calendar views with the page's filters; the CSV
// carries metadata only, full text sits on its own Excel sheet.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingContent } from "../../lib/marketing/types";

const h = vi.hoisted(() => ({ listScheduledContent: vi.fn(), listContentForExport: vi.fn(), listNamesForExport: vi.fn() }));
vi.mock("../../lib/marketing/queries", () => ({ listScheduledContent: h.listScheduledContent }));
vi.mock("./queries", () => ({ listContentForExport: h.listContentForExport, listNamesForExport: h.listNamesForExport }));

import { marketingContentExport } from "./content";
import { BUSINESS_ID, OFFERING, exportContext, headers, params, renderText, rowValues, sheet } from "./test-support";

const CAMPAIGN = "66666666-6666-4666-8666-666666666666";

function item(overrides: Partial<MarketingContent> = {}): MarketingContent {
  return {
    id: "ct-1",
    businessId: BUSINESS_ID,
    offeringId: OFFERING,
    campaignId: CAMPAIGN,
    campaignName: "Spring launch",
    title: "Why payroll fails",
    contentType: "blog",
    brief: null,
    body: "LONG BODY TEXT",
    summary: "Short summary",
    audience: "HR heads",
    channel: "Blog",
    cta: null,
    status: "scheduled",
    scheduledAt: "2026-10-02T04:30:00Z",
    publishedAt: null,
    approvedAt: "2026-09-25T04:30:00Z",
    publishedVersionId: null,
    externalUrl: null,
    seoMetadata: {},
    updatedAt: "2026-09-25T04:30:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listContentForExport.mockResolvedValue([item()]);
  h.listScheduledContent.mockResolvedValue([item(), item({ id: "ct-2", status: "draft", contentType: "email" })]);
  h.listNamesForExport.mockResolvedValue(new Map([[OFFERING, "Payroll suite"]]));
});

describe("EXP-MKT-05 marketing.content", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingContentExport.id).toBe("marketing.content");
    expect(marketingContentExport.module).toBe("discovery");
    expect(marketingContentExport.permissions).toEqual(["marketing.view"]);
  });

  it("list view: the page's filters reach the query with the context's business", async () => {
    const filters = marketingContentExport.parseFilters!(params({ status: "scheduled", type: "blog", campaign: CAMPAIGN, noise: "1" }));
    await marketingContentExport.load(exportContext(), filters);
    expect(h.listContentForExport).toHaveBeenCalledWith(BUSINESS_ID, { status: "scheduled", contentType: "blog", campaignId: CAMPAIGN });
    expect(h.listNamesForExport).toHaveBeenCalledWith(BUSINESS_ID, "products");
    expect(h.listScheduledContent).not.toHaveBeenCalled();
  });

  it("calendar view: the month's scheduled content, filtered as the page filters it", async () => {
    const filters = marketingContentExport.parseFilters!(params({ view: "calendar", month: "2026-10", status: "scheduled" }));
    const wb = await marketingContentExport.load(exportContext(), filters);
    expect(h.listScheduledContent).toHaveBeenCalledWith(BUSINESS_ID, { from: "2026-10-01T00:00:00Z", to: "2026-10-31T23:59:59Z" });
    expect(sheet(wb, "Content").rows).toHaveLength(1);
    expect(wb.metadata?.Month).toBe("2026-10");
  });

  it("exports labels; the CSV has no body text, the workbook keeps it on its own sheet", async () => {
    const wb = await marketingContentExport.load(exportContext(), marketingContentExport.parseFilters!(params()));
    expect(headers(wb, "Content")).toEqual([
      "Title", "Type", "Status", "Campaign", "Offering", "Channel", "Audience", "Scheduled", "Approved", "Published", "Updated", "Published URL",
    ]);
    expect(rowValues(wb, "Content")).toMatchObject({ Title: "Why payroll fails", Type: "Blog", Status: "Scheduled", Campaign: "Spring launch", Offering: "Payroll suite", Published: null });
    expect(rowValues(wb, "Full text")).toMatchObject({ Body: "LONG BODY TEXT", Summary: "Short summary" });
    const csv = await renderText(wb, "csv");
    expect(csv).not.toContain("LONG BODY TEXT");
    expect(csv).toContain("2026-10-02T10:00:00+05:30");
  });
});
