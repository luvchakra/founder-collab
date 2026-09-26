import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-01 -- Inventory Dashboard export: warehouse filter and cost visibility.

const mocks = vi.hoisted(() => ({ hasPermission: vi.fn(), getDashboardSummary: vi.fn(), listWarehouses: vi.fn() }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("../lib/dashboard/queries", () => ({ getDashboardSummary: mocks.getDashboardSummary }));
vi.mock("../lib/warehouses/queries", () => ({ listWarehouses: mocks.listWarehouses }));

import { inventoryDashboardExport } from "./dashboard";
import { BUSINESS_ID, exportContext, requestParams, rowsOf } from "./test-support";

function summary(canViewCost: boolean) {
  return {
    productCount: 12,
    stockValue: canViewCost ? 98765 : null,
    units: 400,
    reserved: 10,
    incoming: 50,
    available: 385,
    healthy: 9,
    low: 2,
    stockout: 1,
    lowStock: [{ id: "p1", name: "Drill", sku: null, reorder_point: 5 }],
    pendingPurchases: 3,
    overduePOs: [{ id: "po1", po_number: "PO-7", supplier_name: "Bosch" }],
    inTransitTransfers: [],
    alerts: [{ id: "a1", title: "Low stock: Drill", severity: "warning" }],
    movementTrend: [{ day: "2026-09-25", label: 25, increase: 10, decrease: 4 }],
    gstRiskCount: 0,
    cgstThisMonth: 90,
    sgstThisMonth: 90,
    igstThisMonth: 0,
    gstPayableThisMonth: 180,
    cgstCollectedThisMonth: 100,
    sgstCollectedThisMonth: 100,
    igstCollectedThisMonth: 0,
    gstCollectedThisMonth: 200,
    salesTodayTotal: 7000,
    hasGstin: true,
    byWarehouse: [{ id: "w1", name: "Main", units: 400 }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listWarehouses.mockResolvedValue([{ id: "w1", name: "Main" }, { id: "w2", name: "Annex" }]);
  mocks.getDashboardSummary.mockImplementation(async (_b: string, canViewCost: boolean) => summary(canViewCost));
});

describe("inventory.dashboard (EXP-INV-01)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryDashboardExport.id).toBe("inventory.dashboard");
    expect(inventoryDashboardExport.module).toBe("inventory");
    expect(inventoryDashboardExport.permissions).toEqual(["inventory.view"]);
  });

  it("applies the selected warehouse, and treats a foreign one as no filter (tenant isolation)", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const selected = await inventoryDashboardExport.load(exportContext(), inventoryDashboardExport.parseFilters!(requestParams({ warehouse: "w2" })));
    expect(mocks.listWarehouses).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.getDashboardSummary).toHaveBeenLastCalledWith(BUSINESS_ID, false, "w2", expect.any(Map));
    expect(selected.metadata).toEqual({ Warehouse: "Annex" });

    const foreign = await inventoryDashboardExport.load(exportContext(), inventoryDashboardExport.parseFilters!(requestParams({ warehouse: "w-other-business" })));
    expect(mocks.getDashboardSummary).toHaveBeenLastCalledWith(BUSINESS_ID, false, undefined, expect.any(Map));
    expect(foreign.metadata).toEqual({ Warehouse: "All warehouses" });
  });

  it("has the backlog's workbook sheets", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const workbook = await inventoryDashboardExport.load(exportContext(), { warehouse: "" });
    expect(workbook.sheets.map((s) => s.sheetName).slice(0, 5)).toEqual(["Summary", "Stock", "Low Stock", "Sales", "Purchasing"]);
    expect(rowsOf(workbook, "Low Stock")[0]).toEqual({ SKU: "", Product: "Drill", "Reorder point": 5 });
    expect(rowsOf(workbook, "Sales").find((r) => r.Metric === "Sales today")).toMatchObject({ Quantity: null, Amount: 7000 });
    expect(rowsOf(workbook, "Purchasing").find((r) => r.Metric === "Open purchase orders")).toMatchObject({ Quantity: 3, Amount: null });
  });

  it("with inventory.view_cost: exports stock value", async () => {
    mocks.hasPermission.mockResolvedValue(true);
    const workbook = await inventoryDashboardExport.load(exportContext(), { warehouse: "" });
    expect(rowsOf(workbook, "Summary").find((r) => r.Metric === "Stock value (at cost)")).toMatchObject({ Amount: 98765 });
  });

  it("without inventory.view_cost: the stock value row is absent, not blank", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const workbook = await inventoryDashboardExport.load(exportContext(), { warehouse: "" });
    expect(rowsOf(workbook, "Summary").some((r) => String(r.Metric).includes("Stock value"))).toBe(false);
    expect(JSON.stringify(rowsOf(workbook, "Summary"))).not.toContain("98765");
  });
});
