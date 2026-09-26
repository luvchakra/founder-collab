import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-08 -- Sales orders export (+ lines).

const mocks = vi.hoisted(() => ({ listSalesOrdersForExport: vi.fn() }));
vi.mock("./queries", () => ({ listSalesOrdersForExport: mocks.listSalesOrdersForExport }));

import { inventorySalesOrdersExport } from "./sales-orders";
import { BUSINESS_ID, exportContext, requestParams, rowsOf } from "./test-support";

function order(overrides: Record<string, unknown>) {
  return {
    id: "so",
    org_id: BUSINESS_ID,
    customer_id: "c1",
    warehouse_id: "w1",
    so_number: "SO-1",
    status: "shipped",
    order_date: "2026-09-12",
    expected_fulfillment_date: null,
    notes: null,
    subtotal: 1000,
    discount_amount: 0,
    cgst_amount: 90,
    sgst_amount: 90,
    igst_amount: 0,
    shipping_amount: 0,
    total_amount: 1180,
    created_by: "u",
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    customer_name: "Asha Stores",
    warehouse_name: "Main",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSalesOrdersForExport.mockResolvedValue({
    orders: [order({ id: "so1" }), order({ id: "so2", so_number: "SO-2", status: "cancelled" })],
    lines: [{ id: "l1", org_id: BUSINESS_ID, sales_order_id: "so1", product_id: "p1", quantity: 2, unit_price: 500, tax_rate: 18, cgst_amount: 90, sgst_amount: 90, igst_amount: 0, created_at: "2026-09-12T00:00:00Z", item_name: "Drill", item_sku: "DRL" }],
    invoices: [{ id: "inv1", sales_order_id: "so1", invoice_number: "INV-1", payment_status: "partial" }],
  });
});

describe("inventory.sales-orders (EXP-INV-08)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventorySalesOrdersExport.id).toBe("inventory.sales-orders");
    expect(inventorySalesOrdersExport.module).toBe("inventory");
    expect(inventorySalesOrdersExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventorySalesOrdersExport.load(exportContext(), inventorySalesOrdersExport.parseFilters!(requestParams()));
    expect(mocks.listSalesOrdersForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports fulfilment and payment status as labels, with a lines sheet", async () => {
    const workbook = await inventorySalesOrdersExport.load(exportContext(), {});
    const [first, second] = rowsOf(workbook, "Sales Orders");
    expect(first).toMatchObject({ "Order number": "SO-1", Customer: "Asha Stores", "Fulfilment status": "Shipped", GST: 180, Total: 1180, Invoice: "INV-1", "Payment status": "Partially paid" });
    expect(second).toMatchObject({ "Fulfilment status": "Cancelled", Invoice: "", "Payment status": "Not invoiced" });
    expect(rowsOf(workbook, "Sales Order Lines")[0]).toMatchObject({ "Order number": "SO-1", Product: "Drill", Quantity: 2, "Unit price": 500, "Tax rate": 0.18, GST: 180 });
  });
});
