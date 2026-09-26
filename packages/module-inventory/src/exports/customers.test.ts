import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-03 -- Inventory customers export.

const mocks = vi.hoisted(() => ({ listCustomersForExport: vi.fn() }));
vi.mock("./queries", () => ({ listCustomersForExport: mocks.listCustomersForExport }));

import { inventoryCustomersExport } from "./customers";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listCustomersForExport.mockResolvedValue([
    { id: "c1", org_id: BUSINESS_ID, name: "Asha Stores", gstin: "29ABCDE1234F1Z5", phone: "+91 98", email: null, billing_address: "MG Road", shipping_address: null, state: "Karnataka", is_active: true, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
    { id: "c2", org_id: BUSINESS_ID, name: "=HYPERLINK(\"x\")", gstin: null, phone: null, email: null, billing_address: null, shipping_address: null, state: null, is_active: false, created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" },
  ]);
});

describe("inventory.customers (EXP-INV-03)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryCustomersExport.id).toBe("inventory.customers");
    expect(inventoryCustomersExport.module).toBe("inventory");
    expect(inventoryCustomersExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventoryCustomersExport.load(exportContext(), inventoryCustomersExport.parseFilters!(requestParams({ active: "true" })));
    expect(mocks.listCustomersForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports contact, GSTIN, location and active status; blanks stay blank", async () => {
    const workbook = await inventoryCustomersExport.load(exportContext(), {});
    expect(headers(workbook, "Customers")).toEqual(["Customer", "Phone", "Email", "GSTIN", "Billing address", "Shipping address", "State", "Active", "Created"]);
    const [first, second] = rowsOf(workbook, "Customers");
    expect(first).toMatchObject({ Customer: "Asha Stores", GSTIN: "29ABCDE1234F1Z5", State: "Karnataka", Active: true, Email: "" });
    expect(second).toMatchObject({ GSTIN: "", Active: false });
  });
});
