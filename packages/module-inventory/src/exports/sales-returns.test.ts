import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-09 (Returns) -- Sales returns export.

const mocks = vi.hoisted(() => ({ listSalesReturnsForExport: vi.fn() }));
vi.mock("./queries", () => ({ listSalesReturnsForExport: mocks.listSalesReturnsForExport }));

import { inventorySalesReturnsExport } from "./sales-returns";
import { BUSINESS_ID, exportContext, requestParams, rowsOf } from "./test-support";

function ret(overrides: Record<string, unknown>) {
  return {
    id: "r",
    org_id: BUSINESS_ID,
    sales_order_id: "so1",
    sales_invoice_id: null,
    credit_note_id: null,
    return_number: "RET-1",
    status: "approved",
    return_date: "2026-09-20",
    notes: null,
    requested_by: "u",
    approved_by: null,
    approved_at: "2026-09-20T05:00:00Z",
    completed_at: null,
    cancelled_at: null,
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    so_number: "SO-1",
    customer_name: "Asha Stores",
    credit_note_number: "CN-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSalesReturnsForExport.mockResolvedValue({
    returns: [ret({ id: "r1" }), ret({ id: "r2", return_number: "RET-2", status: "draft", credit_note_number: null })],
    lines: [
      { id: "l1", org_id: BUSINESS_ID, sales_return_id: "r1", product_id: "p1", quantity: 1, unit_price: 500, reason: "damaged", restock: false, is_damaged: true, created_at: "2026-09-20T00:00:00Z" },
      { id: "l2", org_id: BUSINESS_ID, sales_return_id: "r1", product_id: "p2", quantity: 2, unit_price: 100, reason: "wrong_item", restock: true, is_damaged: false, created_at: "2026-09-20T00:00:00Z" },
    ],
  });
});

describe("inventory.sales-returns (EXP-INV-09)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventorySalesReturnsExport.id).toBe("inventory.sales-returns");
    expect(inventorySalesReturnsExport.module).toBe("inventory");
    expect(inventorySalesReturnsExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventorySalesReturnsExport.load(exportContext(), inventorySalesReturnsExport.parseFilters!(requestParams()));
    expect(mocks.listSalesReturnsForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports reason labels and value from the lines; a return with no lines has a blank total", async () => {
    const workbook = await inventorySalesReturnsExport.load(exportContext(), {});
    const [first, second] = rowsOf(workbook, "Returns");
    expect(first).toMatchObject({ "Return number": "RET-1", "Sales order": "SO-1", Customer: "Asha Stores", Reason: "Damaged; Wrong item", Status: "Approved", "Quantity returned": 3, Total: 700, "Credit note": "CN-1" });
    expect(second).toMatchObject({ Reason: "", Status: "Draft", Total: null, "Credit note": "" });
  });
});
