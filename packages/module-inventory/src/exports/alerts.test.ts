import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-11 -- Inventory alerts export.

const mocks = vi.hoisted(() => ({ listAlertsForExport: vi.fn() }));
vi.mock("./queries", () => ({ listAlertsForExport: mocks.listAlertsForExport }));

import { inventoryAlertsExport } from "./alerts";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAlertsForExport.mockResolvedValue([
    { id: "a1", business_id: BUSINESS_ID, type: "low_stock", severity: "critical", title: "Out of stock: Drill", description: null, entity_type: "stock_level", entity_id: "sl1", status: "resolved", recommended_action: "Reorder 20", resolution: "PO raised", resolved_at: "2026-09-22T00:00:00Z", created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-22T00:00:00Z", product_name: "Drill", warehouse_name: "Main" },
    { id: "a2", business_id: BUSINESS_ID, type: "custom", severity: "info", title: "Note", description: null, entity_type: null, entity_id: null, status: "open", recommended_action: null, resolution: null, resolved_at: null, created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z", product_name: null, warehouse_name: null },
  ]);
});

describe("inventory.alerts (EXP-INV-11)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryAlertsExport.id).toBe("inventory.alerts");
    expect(inventoryAlertsExport.module).toBe("inventory");
    expect(inventoryAlertsExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventoryAlertsExport.load(exportContext(), inventoryAlertsExport.parseFilters!(requestParams({ status: "open" })));
    expect(mocks.listAlertsForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports type, product, warehouse, severity, status and resolution as labels", async () => {
    const workbook = await inventoryAlertsExport.load(exportContext(), {});
    expect(headers(workbook, "Alerts")).toEqual(["Alert type", "Alert", "Product", "Warehouse", "Severity", "Status", "Created", "Resolved at", "Resolution", "Recommended action"]);
    const [first, second] = rowsOf(workbook, "Alerts");
    expect(first).toMatchObject({ "Alert type": "Low stock", Product: "Drill", Warehouse: "Main", Severity: "Critical", Status: "Resolved", Resolution: "PO raised" });
    expect(second).toMatchObject({ Product: "", Warehouse: "", Status: "Open", "Resolved at": null, Resolution: "" });
  });
});
