// EXP-DISC-12 -- Discovery Watchlist export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOREIGN_WORKSPACE_ID, OTHER_BUSINESS_ID, WORKSPACE_ID, headersOf, makeContext, makeProduct, makeWorkspace, rowsOf, tamperedParams } from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getWatchlistDashboardRows: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("../../lib/watchlist/queries", () => ({ getWatchlistDashboardRows: h.getWatchlistDashboardRows }));

const { discoveryWatchlistExport: adapter } = await import("./watchlist");

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.getWatchlistDashboardRows.mockResolvedValue([
    {
      id: "w1",
      workspace_id: WORKSPACE_ID,
      prospect_id: "p1",
      watch_reason: "Waiting for budget cycle",
      next_review_at: "2020-01-01T00:00:00Z",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      prospectCompanyName: "Globex",
      prospectIndustry: "Logistics",
      currentScore: 70,
      lastSignalDescription: "Hiring ops leads",
      lastSignalAt: "2026-09-10T00:00:00Z",
    },
    {
      id: "w2",
      workspace_id: WORKSPACE_ID,
      prospect_id: "p2",
      watch_reason: "Competitor contract ends",
      next_review_at: null,
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
      prospectCompanyName: "Initech",
      prospectIndustry: null,
      currentScore: null,
      lastSignalDescription: null,
      lastSignalAt: null,
    },
  ]);
});

describe("discovery.watchlist (EXP-DISC-12)", () => {
  it("is the Discovery-licensed watchlist export", () => {
    expect(adapter.id).toBe("discovery.watchlist");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("reads the verified workspace only", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(h.getWatchlistDashboardRows).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(h.getWatchlistDashboardRows).not.toHaveBeenCalledWith(FOREIGN_WORKSPACE_ID);
  });

  it("refuses an offering from another business", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()))).rejects.toMatchObject({ status: 404 });
    expect(h.getWatchlistDashboardRows).not.toHaveBeenCalled();
  });

  it("exports each watched account; unknowns stay blank", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(headersOf(workbook, "Watchlist")).toEqual([
      "Prospect",
      "Industry",
      "Watch reason",
      "Next review",
      "Review due",
      "Current fit score",
      "Fit score basis",
      "Last signal",
      "Last signal date",
      "Added",
      "Updated",
    ]);
    const [globex, initech] = rowsOf(workbook, "Watchlist");
    expect(globex).toMatchObject({ Prospect: "Globex", "Review due": true, "Current fit score": 70, "Last signal": "Hiring ops leads" });
    expect(initech).toMatchObject({ "Review due": null, "Current fit score": null, "Fit score basis": null, "Last signal": null, "Last signal date": null });
  });
});
