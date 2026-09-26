// EXP-MKT-06 -- Marketing assets export: metadata only, never a signed URL or storage path.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listAssetsForExport: vi.fn(), listNamesForExport: vi.fn() }));
vi.mock("./queries", () => ({ listAssetsForExport: h.listAssetsForExport, listNamesForExport: h.listNamesForExport }));

import { marketingAssetsExport } from "./assets";
import { BUSINESS_ID, OFFERING, allCellText, exportContext, headers, params, renderText, rowValues } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  h.listAssetsForExport.mockResolvedValue([
    {
      id: "a-1",
      businessId: BUSINESS_ID,
      attachmentId: "att-1",
      name: "Hero image",
      assetType: "brand_material",
      fileName: "hero.png",
      contentType: "image/png",
      sizeBytes: 204800,
      altText: "Our team",
      description: null,
      campaignId: "c-archived",
      contentId: null,
      offeringId: OFFERING,
      createdAt: "2026-09-01T00:00:00Z",
      status: "active",
    },
  ]);
  h.listNamesForExport.mockImplementation(async (_b: string, table: string) =>
    table === "products" ? new Map([[OFFERING, "Payroll suite"]]) : new Map([["c-archived", "Old campaign"]]),
  );
});

describe("EXP-MKT-06 marketing.assets", () => {
  it("is a Discovery export gated on marketing.view", () => {
    expect(marketingAssetsExport.id).toBe("marketing.assets");
    expect(marketingAssetsExport.module).toBe("discovery");
    expect(marketingAssetsExport.permissions).toEqual(["marketing.view"]);
  });

  it("reads the context's business only and ignores request params", async () => {
    expect(marketingAssetsExport.parseFilters!(params({ anything: "x" }))).toEqual({});
    await marketingAssetsExport.load(exportContext(), {});
    expect(h.listAssetsForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listNamesForExport).toHaveBeenCalledWith(BUSINESS_ID, "marketing_campaigns");
  });

  it("exports the asset metadata with labels", async () => {
    const wb = await marketingAssetsExport.load(exportContext(), {});
    expect(headers(wb, "Assets")).toEqual([
      "Asset", "Type", "Campaign", "Offering", "File name", "File size (bytes)", "MIME type", "Alt text", "Description", "Created", "Status",
    ]);
    expect(rowValues(wb, "Assets")).toMatchObject({
      Asset: "Hero image",
      Type: "Brand material",
      Campaign: "Old campaign",
      Offering: "Payroll suite",
      "File size (bytes)": 204800,
      "MIME type": "image/png",
      Status: "Active",
    });
  });

  it("contains no signed URL, storage bucket or path", async () => {
    const wb = await marketingAssetsExport.load(exportContext(), {});
    const text = allCellText(wb) + (await renderText(wb));
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/attachments\/|storage|token/i);
    expect(text).not.toContain("att-1");
  });
});
