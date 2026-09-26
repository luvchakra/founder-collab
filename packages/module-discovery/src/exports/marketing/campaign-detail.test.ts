// EXP-MKT-04 -- Campaign detail export: one campaign loaded with the context's business
// (another business's campaign is a 404), its daily metric table as rendered, and its
// linked records -- assets as metadata only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDeniedError } from "@cofounderai/core/exports/server";

const h = vi.hoisted(() => ({
  getCampaign: vi.fn(),
  listCampaignMetrics: vi.fn(),
  listContent: vi.fn(),
  listEntityActivity: vi.fn(),
  listAttributions: vi.fn(),
  listAssetsForExport: vi.fn(),
}));
vi.mock("../../lib/marketing/queries", () => ({
  getCampaign: h.getCampaign,
  listCampaignMetrics: h.listCampaignMetrics,
  listContent: h.listContent,
  listEntityActivity: h.listEntityActivity,
  listAttributions: h.listAttributions,
}));
vi.mock("./queries", () => ({ listAssetsForExport: h.listAssetsForExport }));

import { describeActivity, marketingCampaignExport } from "./campaign-detail";
import { BUSINESS_ID, allCellText, campaign, exportContext, headers, metric, params, renderText, rowValues, sheet } from "./test-support";

const CAMPAIGN_ID = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  h.getCampaign.mockResolvedValue(campaign({ id: CAMPAIGN_ID }));
  h.listCampaignMetrics.mockResolvedValue([
    metric({ campaignId: CAMPAIGN_ID, metricDate: "2026-09-19", spend: 400 }),
    metric({ campaignId: CAMPAIGN_ID, metricDate: "2026-09-20", source: "import", leads: null }),
  ]);
  h.listContent.mockResolvedValue([
    { id: "ct-1", title: "Launch post", contentType: "social", status: "review", scheduledAt: null, publishedAt: null, updatedAt: "2026-09-02T00:00:00Z" },
  ]);
  h.listAssetsForExport.mockResolvedValue([
    { id: "a-1", name: "Hero image", assetType: "image", fileName: "hero.png", contentType: "image/png", sizeBytes: 2048, campaignId: CAMPAIGN_ID, createdAt: "2026-09-01T00:00:00Z" },
    { id: "a-2", name: "Other", assetType: "logo", fileName: "logo.svg", contentType: "image/svg+xml", sizeBytes: 10, campaignId: null, createdAt: "2026-09-01T00:00:00Z" },
  ]);
  h.listEntityActivity.mockResolvedValue([
    { id: "e-1", action: "campaign.transition", createdAt: "2026-09-01T05:00:00Z", before: { status: "draft" }, after: { status: "active", secret: "x" } },
  ]);
  h.listAttributions.mockResolvedValue([
    { id: "t-1", entityType: "prospect", entityId: "p-1", label: "Acme Corp", touchType: "first_touch", source: "inferred", occurredAt: "2026-09-05T00:00:00Z", evidenceNote: null },
  ]);
});

describe("EXP-MKT-04 marketing.campaign", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingCampaignExport.id).toBe("marketing.campaign");
    expect(marketingCampaignExport.module).toBe("discovery");
    expect(marketingCampaignExport.permissions).toEqual(["marketing.view"]);
  });

  it("loads the campaign with the context's business, never one from the request", async () => {
    await marketingCampaignExport.load(exportContext(), marketingCampaignExport.parseFilters!(params({ campaignId: CAMPAIGN_ID })));
    expect(h.getCampaign).toHaveBeenCalledWith(BUSINESS_ID, CAMPAIGN_ID);
    for (const fn of [h.listCampaignMetrics, h.listContent, h.listAssetsForExport, h.listEntityActivity, h.listAttributions]) {
      expect(fn.mock.calls[0]?.[0]).toBe(BUSINESS_ID);
    }
  });

  it("is a 404 when the campaign isn't this business's (or the id is missing)", async () => {
    h.getCampaign.mockResolvedValue(null);
    await expect(marketingCampaignExport.load(exportContext(), { campaignId: CAMPAIGN_ID })).rejects.toMatchObject({ status: 404 });
    await expect(marketingCampaignExport.load(exportContext(), marketingCampaignExport.parseFilters!(params()))).rejects.toBeInstanceOf(ExportDeniedError);
  });

  it("exports every sheet, the daily table newest first with blanks kept blank", async () => {
    const wb = await marketingCampaignExport.load(exportContext(), { campaignId: CAMPAIGN_ID });
    expect(wb.sheets.map((s) => s.sheetName)).toEqual(["Campaign", "Results", "Daily Metrics", "Content", "Assets", "Attributions", "Activity"]);
    expect(wb.csvSheet).toBe("Daily Metrics");
    expect(headers(wb, "Daily Metrics")).toEqual([
      "Date", "Source", "Sessions", "Leads", "Qualified leads", "Opportunities", "Customers", "Spend", "Revenue", "Currency",
    ]);
    expect(rowValues(wb, "Daily Metrics", 0)).toMatchObject({ Date: "2026-09-20", Source: "Import", Leads: null, Spend: null, Revenue: null });
    expect(rowValues(wb, "Daily Metrics", 1)).toMatchObject({ Date: "2026-09-19", Source: "Manual", Leads: 12, Spend: 400 });
    expect(rowValues(wb, "Content")).toMatchObject({ Title: "Launch post", Type: "LinkedIn / Social", Status: "In review" });
    expect(sheet(wb, "Assets").rows).toHaveLength(1);
    expect(rowValues(wb, "Attributions")).toMatchObject({ Record: "Acme Corp", "Record type": "Prospect", Touch: "First touch", "Attribution source": "AI-inferred" });
    expect(rowValues(wb, "Activity")).toMatchObject({ Activity: "Status draft -> active" });
    const csv = await renderText(wb);
    expect(csv.split("\r\n")[1]).toBe("2026-09-20,Import,300,,,,2,,,INR");
    expect((await renderText(wb, "xlsx")).startsWith("PK")).toBe(true);
  });

  it("never exports storage locations or raw audit payloads", async () => {
    const wb = await marketingCampaignExport.load(exportContext(), { campaignId: CAMPAIGN_ID });
    const text = allCellText(wb);
    expect(text).not.toMatch(/storage|signed|token=/i);
    expect(text).not.toContain("secret");
  });

  it("describes a non-status action by its humanised verb", () => {
    expect(describeActivity({ id: "x", action: "campaign.duplicated_from", createdAt: "", before: null, after: null })).toBe("Duplicated from");
  });
});
