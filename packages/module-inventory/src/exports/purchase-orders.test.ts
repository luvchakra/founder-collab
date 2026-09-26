import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-07 -- Purchase orders export (+ lines), supplier cost gated both ways.

const mocks = vi.hoisted(() => ({ hasPermission: vi.fn(), listPurchaseOrdersForExport: vi.fn() }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("./queries", () => ({ listPurchaseOrdersForExport: mocks.listPurchaseOrdersForExport }));

import { inventoryPurchaseOrdersExport } from "./purchase-orders";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPurchaseOrdersForExport.mockResolvedValue({
    orders: [
      {
        id: "po1",
        org_id: BUSINESS_ID,
        supplier_id: "s1",
        warehouse_id: "w1",
        po_number: "PO-0001",
        status: "partially_received",
        order_date: "2026-09-10",
        expected_delivery_date: null,
        notes: "call before delivery",
        subtotal: 10000,
        tax_amount: 1800,
        cgst_amount: 900,
        sgst_amount: 900,
        igst_amount: 0,
        discount_amount: 0,
        shipping_amount: 200,
        total_amount: 12000,
        created_by: "user-1",
        created_at: "2026-09-10T00:00:00Z",
        updated_at: "2026-09-10T00:00:00Z",
        supplier_name: "Bosch",
        warehouse_name: "Main",
      },
    ],
    lines: [
      {
        id: "l1",
        org_id: BUSINESS_ID,
        purchase_order_id: "po1",
        product_id: "p1",
        quantity: 10,
        received_quantity: 4,
        unit_cost: 777.25,
        tax_rate: 18,
        cgst_amount: 450,
        sgst_amount: 450,
        igst_amount: 0,
        created_at: "2026-09-10T00:00:00Z",
        item_name: "Drill",
        item_sku: "DRL-001",
      },
    ],
  });
});

describe("inventory.purchase-orders (EXP-INV-07)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryPurchaseOrdersExport.id).toBe("inventory.purchase-orders");
    expect(inventoryPurchaseOrdersExport.module).toBe("inventory");
    expect(inventoryPurchaseOrdersExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    await inventoryPurchaseOrdersExport.load(exportContext(), inventoryPurchaseOrdersExport.parseFilters!(requestParams({ status: "draft" })));
    expect(mocks.listPurchaseOrdersForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.hasPermission).toHaveBeenCalledWith(BUSINESS_ID, "inventory.view_cost");
  });

  it("exports orders with labels, totals and received/outstanding quantities", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const workbook = await inventoryPurchaseOrdersExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Purchase Orders")[0]).toMatchObject({
      "PO number": "PO-0001",
      Supplier: "Bosch",
      Warehouse: "Main",
      Status: "Partially received",
      "Order date": "2026-09-10",
      "Expected delivery": null,
      Total: 12000,
      "Ordered quantity": 10,
      "Received quantity": 4,
      "Outstanding quantity": 6,
    });
    expect(JSON.stringify(rowsOf(workbook, "Purchase Orders"))).not.toContain("call before delivery");
  });

  it("with inventory.view_cost: lines carry unit cost, line value and tax", async () => {
    mocks.hasPermission.mockResolvedValue(true);
    const workbook = await inventoryPurchaseOrdersExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Purchase Order Lines")[0]).toMatchObject({ "Unit cost": 777.25, "Line value (before tax)": 7772.5, CGST: 450 });
  });

  it("without inventory.view_cost: supplier-cost columns are absent from the lines", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const workbook = await inventoryPurchaseOrdersExport.load(exportContext(), {});
    expect(headers(workbook, "Purchase Order Lines")).toEqual(["PO number", "SKU", "Product", "Ordered", "Received", "Outstanding", "Tax rate"]);
    expect(JSON.stringify(rowsOf(workbook, "Purchase Order Lines"))).not.toContain("777");
  });
});
