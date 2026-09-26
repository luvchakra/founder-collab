// EXP-DISC-12 -- Discovery Usage export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOREIGN_WORKSPACE_ID, OTHER_BUSINESS_ID, WORKSPACE_ID, headersOf, makeContext, makeProduct, makeWorkspace, rowsOf, sheetNames, tamperedParams } from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getWorkspaceUsage: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("../../lib/usage/queries", () => ({ getWorkspaceUsage: h.getWorkspaceUsage }));

const { discoveryUsageExport: adapter } = await import("./usage");

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.getWorkspaceUsage.mockResolvedValue({
    workspaceId: WORKSPACE_ID,
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-10-01T00:00:00.000Z",
    totalRuns: 30,
    totalCost: 5,
    byOperation: [
      { operation: "research_prospect", runs: 20, cost: 4 },
      { operation: "some_new_operation", runs: 10, cost: 1 },
    ],
  });
});

describe("discovery.usage (EXP-DISC-12)", () => {
  it("is the Discovery-licensed usage export", () => {
    expect(adapter.id).toBe("discovery.usage");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("reads the verified workspace only", async () => {
    await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(h.getWorkspaceUsage).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(h.getWorkspaceUsage).not.toHaveBeenCalledWith(FOREIGN_WORKSPACE_ID);
  });

  it("refuses an offering from another business", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()))).rejects.toMatchObject({ status: 404 });
  });

  it("exports runs, limits and shares of the credit allowance -- never a currency figure", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(sheetNames(workbook)).toEqual(["Summary", "By operation"]);
    expect(workbook.csvSheet).toBe("By operation");
    expect(rowsOf(workbook, "Summary")[0]).toMatchObject({ "AI runs": 30, "Monthly run limit": 200, "AI credits used": 0.25, "Limit reached": false });
    expect(headersOf(workbook, "By operation")).toEqual(["Operation", "Runs", "Share of monthly AI credits", "Period start", "Period end"]);
    expect(rowsOf(workbook, "By operation")).toEqual([
      expect.objectContaining({ Operation: "Prospect research", Runs: 20, "Share of monthly AI credits": 0.2 }),
      expect.objectContaining({ Operation: "some_new_operation", Runs: 10 }),
    ]);
    const headers = workbook.sheets.flatMap((s) => s.columns.map((c) => c.header.toLowerCase()));
    expect(headers.some((header) => header.includes("cost") || header.includes("usd"))).toBe(false);
  });
});
