import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-10 -- Stock transfers export.

const mocks = vi.hoisted(() => ({ listStockTransfersForExport: vi.fn() }));
vi.mock("./queries", () => ({ listStockTransfersForExport: mocks.listStockTransfersForExport }));

import { inventoryTransfersExport } from "./transfers";
import { BUSINESS_ID, exportContext, requestParams, rowsOf } from "./test-support";

function transfer(overrides: Record<string, unknown>) {
  return {
    id: "t",
    business_id: BUSINESS_ID,
    transfer_number: "TR-1",
    source_warehouse_id: "w1",
    destination_warehouse_id: "w2",
    status: "in_transit",
    notes: null,
    requested_by: "u",
    approved_by: null,
    shipped_at: "2026-09-21T00:00:00Z",
    received_at: null,
    completed_at: null,
    cancelled_at: null,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
    source_warehouse_name: "Main",
    destination_warehouse_name: "Annex",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listStockTransfersForExport.mockResolvedValue({
    transfers: [transfer({ id: "t1" }), transfer({ id: "t2", transfer_number: "TR-2", status: "draft", shipped_at: null })],
    lines: [{ id: "l1", business_id: BUSINESS_ID, stock_transfer_id: "t1", item_id: "p1", quantity: 5, received_quantity: 0, damaged_quantity: 0, created_at: "2026-09-20T00:00:00Z" }],
  });
});

describe("inventory.transfers (EXP-INV-10)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryTransfersExport.id).toBe("inventory.transfers");
    expect(inventoryTransfersExport.module).toBe("inventory");
    expect(inventoryTransfersExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventoryTransfersExport.load(exportContext(), inventoryTransfersExport.parseFilters!(requestParams()));
    expect(mocks.listStockTransfersForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports warehouses, stage label, quantities and dates; not-yet-reached stages stay blank", async () => {
    const workbook = await inventoryTransfersExport.load(exportContext(), {});
    const [first, second] = rowsOf(workbook, "Stock Transfers");
    expect(first).toMatchObject({ "Transfer number": "TR-1", "Source warehouse": "Main", "Destination warehouse": "Annex", Status: "In Transit", "Requested quantity": 5, "Shipped quantity": 5, "Received quantity": null, "Received at": null });
    expect(second).toMatchObject({ Status: "Draft", "Requested quantity": 0, "Shipped quantity": null, "Shipped at": null });
  });
});
