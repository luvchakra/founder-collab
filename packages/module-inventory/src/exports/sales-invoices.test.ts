import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-09 (Sales invoices) -- Sales invoices export.

const mocks = vi.hoisted(() => ({ listSalesInvoicesForExport: vi.fn() }));
vi.mock("./queries", () => ({ listSalesInvoicesForExport: mocks.listSalesInvoicesForExport }));

import { inventorySalesInvoicesExport } from "./sales-invoices";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSalesInvoicesForExport.mockResolvedValue([
    { id: "i1", org_id: BUSINESS_ID, sales_order_id: "so1", customer_id: "c1", invoice_number: "INV-1", invoice_date: "2026-09-13", customer_gstin: null, billing_address: "MG Road", shipping_address: null, subtotal: 1000, discount_amount: 0, cgst_amount: 90, sgst_amount: 90, igst_amount: 0, shipping_amount: 0, total_amount: 1180, payment_status: "unpaid", created_by: "u", created_at: "2026-09-13T00:00:00Z", updated_at: "2026-09-13T00:00:00Z", customer_name: "Asha Stores", so_number: "SO-1" },
  ]);
});

describe("inventory.sales-invoices (EXP-INV-09)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventorySalesInvoicesExport.id).toBe("inventory.sales-invoices");
    expect(inventorySalesInvoicesExport.module).toBe("inventory");
    expect(inventorySalesInvoicesExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventorySalesInvoicesExport.load(exportContext(), inventorySalesInvoicesExport.parseFilters!(requestParams()));
    expect(mocks.listSalesInvoicesForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports taxable amount, GST, total, payment status label and source", async () => {
    const workbook = await inventorySalesInvoicesExport.load(exportContext(), {});
    expect(headers(workbook, "Sales Invoices")).not.toContain("Due date");
    expect(rowsOf(workbook, "Sales Invoices")[0]).toMatchObject({
      "Invoice number": "INV-1",
      Customer: "Asha Stores",
      "Customer GSTIN": "",
      "Invoice date": "2026-09-13",
      "Taxable amount": 1000,
      GST: 180,
      Total: 1180,
      "Payment status": "Unpaid",
      "Source (sales order)": "SO-1",
    });
  });
});
