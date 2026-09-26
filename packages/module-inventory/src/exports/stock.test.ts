import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-06 -- Stock levels export.

const mocks = vi.hoisted(() => ({ listStockLevelsForExport: vi.fn() }));
vi.mock("./queries", () => ({ listStockLevelsForExport: mocks.listStockLevelsForExport }));

import { inventoryStockExport, reorderStatus } from "./stock";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

function level(overrides: Record<string, unknown>) {
  return {
    id: "sl",
    business_id: BUSINESS_ID,
    item_id: "p1",
    warehouse_id: "w1",
    quantity: 10,
    reserved: 2,
    damaged: 1,
    expired: 0,
    in_transit: 0,
    updated_at: "2026-09-25T06:00:00Z",
    item_name: "Drill",
    item_sku: "DRL-001",
    reorder_point: 5,
    warehouse_name: "Main",
    incoming: 20,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listStockLevelsForExport.mockResolvedValue([level({ id: "a" }), level({ id: "b", quantity: 4, item_sku: null }), level({ id: "c", quantity: 0 })]);
});

describe("inventory.stock (EXP-INV-06)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryStockExport.id).toBe("inventory.stock");
    expect(inventoryStockExport.module).toBe("inventory");
    expect(inventoryStockExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventoryStockExport.load(exportContext(), inventoryStockExport.parseFilters!(requestParams({ warehouse: "w9" })));
    expect(mocks.listStockLevelsForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports the page's quantities with available and reorder status computed the page's way", async () => {
    const workbook = await inventoryStockExport.load(exportContext(), {});
    expect(headers(workbook, "Stock")).toEqual([
      "Warehouse",
      "SKU",
      "Product",
      "On hand",
      "Reserved",
      "Damaged",
      "Expired",
      "Available",
      "Incoming",
      "In transit",
      "Reorder point",
      "Reorder status",
      "Last movement",
    ]);
    const rows = rowsOf(workbook, "Stock");
    expect(rows[0]).toMatchObject({ Warehouse: "Main", SKU: "DRL-001", "On hand": 10, Available: 7, Incoming: 20, "Reorder status": "Healthy" });
    expect(rows[1]).toMatchObject({ SKU: "", "Reorder status": "Low stock" });
    expect(rows[2]).toMatchObject({ "Reorder status": "Out of stock" });
  });

  it("no reorder point means never low", () => {
    expect(reorderStatus({ quantity: 1, reorder_point: 0 })).toBe("Healthy");
  });
});
