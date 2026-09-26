import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-05 -- Warehouses export.

const mocks = vi.hoisted(() => ({ listWarehouses: vi.fn() }));
vi.mock("../lib/warehouses/queries", () => ({ listWarehouses: mocks.listWarehouses }));

import { inventoryWarehousesExport } from "./warehouses";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listWarehouses.mockResolvedValue([
    { id: "w1", business_id: BUSINESS_ID, name: "Main", code: "MAIN", type: "distribution_center", address: "Plot 4", city: "Pune", state: "MH", country: "India", postal_code: null, contact_name: "Sam", contact_phone: null, is_active: true, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
  ]);
});

describe("inventory.warehouses (EXP-INV-05)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryWarehousesExport.id).toBe("inventory.warehouses");
    expect(inventoryWarehousesExport.module).toBe("inventory");
    expect(inventoryWarehousesExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventoryWarehousesExport.load(exportContext(), inventoryWarehousesExport.parseFilters!(requestParams()));
    expect(mocks.listWarehouses).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports warehouse, address, contact and active with labels", async () => {
    const workbook = await inventoryWarehousesExport.load(exportContext(), {});
    expect(headers(workbook, "Warehouses")).not.toContain("Capacity");
    expect(rowsOf(workbook, "Warehouses")[0]).toMatchObject({ Warehouse: "Main", Type: "Distribution center", City: "Pune", "Postal code": "", Contact: "Sam", Active: true });
  });
});
