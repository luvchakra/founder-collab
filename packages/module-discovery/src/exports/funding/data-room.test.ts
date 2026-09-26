// EXP-FND-09 -- Data room export: metadata only. No signed URLs, storage paths, share
// tokens or document bytes -- in the rows or in the rendered files.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listDataRoomItemsForExport: vi.fn(), listShares: vi.fn(), listRounds: vi.fn() }));
vi.mock("./queries", () => ({ listDataRoomItemsForExport: h.listDataRoomItemsForExport }));
vi.mock("../../lib/funding/queries", () => ({ listShares: h.listShares, listRounds: h.listRounds }));

import { fundingDataRoomExport } from "./data-room";
import { BUSINESS_ID, ROUND_ID, allCellText, exportContext, headers, params, renderText, round, rowValues } from "./test-support";

const FUTURE = "2099-01-01T00:00:00Z";

beforeEach(() => {
  vi.clearAllMocks();
  h.listRounds.mockResolvedValue([round()]);
  h.listDataRoomItemsForExport.mockResolvedValue([
    {
      id: "d-1", roundId: ROUND_ID, name: "Pitch deck", category: "fundraising", fileName: "deck-v1.pdf", contentType: "application/pdf",
      sizeBytes: 1000, uploadedAt: "2026-09-01T00:00:00Z", status: "ready", description: null, version: 1, supersedesId: null,
      isCurrent: false, sensitivity: "confidential", expiresAt: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z",
    },
    {
      id: "d-2", roundId: ROUND_ID, name: "Pitch deck", category: "fundraising", fileName: "deck-v2.pdf", contentType: "application/pdf",
      sizeBytes: 2000, uploadedAt: "2026-09-10T00:00:00Z", status: "shared", description: null, version: 2, supersedesId: "d-1",
      isCurrent: true, sensitivity: "highly_confidential", expiresAt: "2026-12-31", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z",
    },
    {
      id: "d-3", roundId: null, name: "Cap table", category: "corporate", fileName: null, contentType: null, sizeBytes: null, uploadedAt: null,
      status: "missing", description: null, version: 1, supersedesId: null, isCurrent: true, sensitivity: "standard", expiresAt: null,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    },
  ]);
  h.listShares.mockResolvedValue([
    { id: "s-1", dataRoomItemId: "d-2", investorId: "i-1", investorName: "Blue Fund", recipientEmail: "deals@bluefund.example", permission: "view", sharedAt: "2026-09-11T00:00:00Z", expiresAt: FUTURE, revokedAt: null, accessCount: 3, lastAccessedAt: "2026-09-12T00:00:00Z" },
    { id: "s-2", dataRoomItemId: "d-2", investorId: null, investorName: null, recipientEmail: "x@y.example", permission: "download", sharedAt: "2026-09-11T00:00:00Z", expiresAt: FUTURE, revokedAt: "2026-09-13T00:00:00Z", accessCount: 0, lastAccessedAt: null },
    { id: "s-3", dataRoomItemId: "d-1", investorId: null, investorName: null, recipientEmail: "old@y.example", permission: "view", sharedAt: "2026-09-02T00:00:00Z", expiresAt: "2026-09-03T00:00:00Z", revokedAt: null, accessCount: 1, lastAccessedAt: null },
  ]);
});

describe("EXP-FND-09 funding.data-room", () => {
  it("is a Discovery export gated on funding.view", () => {
    expect(fundingDataRoomExport.id).toBe("funding.data-room");
    expect(fundingDataRoomExport.module).toBe("discovery");
    expect(fundingDataRoomExport.permissions).toEqual(["funding.view"]);
  });

  it("reads the context's business only", async () => {
    expect(fundingDataRoomExport.parseFilters!(params())).toEqual({});
    await fundingDataRoomExport.load(exportContext(), {});
    expect(h.listDataRoomItemsForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listShares).toHaveBeenCalledWith(BUSINESS_ID);
    expect(h.listRounds).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports document metadata: versions, supersession, sensitivity, share counts", async () => {
    const wb = await fundingDataRoomExport.load(exportContext(), {});
    expect(headers(wb, "Documents").slice(0, 8)).toEqual(["Document", "Category", "Status", "Sensitivity", "Round", "Version", "Current version", "Superseded by"]);
    expect(rowValues(wb, "Documents", 0)).toMatchObject({ Document: "Pitch deck", Version: 1, "Current version": false, "Superseded by": "v2", Sensitivity: "Confidential", "Share links": 1, "Active share links": 0 });
    expect(rowValues(wb, "Documents", 1)).toMatchObject({ Status: "Shared", Sensitivity: "Highly confidential", "Share links": 2, "Active share links": 1, "Revoked share links": 1, Round: "Seed 2026", "Latest share expiry": FUTURE });
    expect(rowValues(wb, "Documents", 2)).toMatchObject({ Document: "Cap table", Status: "Missing", "File name": null, Uploaded: null, "Share links": 0 });
  });

  it("exports share links as counts, expiry and revoked state", async () => {
    const wb = await fundingDataRoomExport.load(exportContext(), {});
    expect(headers(wb, "Shares")).toEqual(["Document", "Version", "Investor", "Recipient", "Permission", "Shared", "Expires", "State", "Revoked", "Times opened", "Last opened"]);
    expect(rowValues(wb, "Shares", 0)).toMatchObject({ Document: "Pitch deck", Version: 2, State: "Active", Permission: "View only", "Times opened": 3 });
    expect(rowValues(wb, "Shares", 1)).toMatchObject({ State: "Revoked", Permission: "View and download" });
    expect(rowValues(wb, "Shares", 2)).toMatchObject({ State: "Expired" });
  });

  it("contains no signed URL, storage path, token or file bytes", async () => {
    const wb = await fundingDataRoomExport.load(exportContext(), {});
    const everything = [allCellText(wb), await renderText(wb, "csv")].join("\n");
    expect(everything).not.toMatch(/https?:\/\//);
    expect(everything).not.toMatch(/token|signed|storage|\/p\/dr\//i);
    expect(everything).not.toContain(`${BUSINESS_ID}/`);
    for (const sheet of wb.sheets) {
      for (const column of sheet.columns) expect(column.header).not.toMatch(/url|path|token|link$/i);
    }
  });
});
