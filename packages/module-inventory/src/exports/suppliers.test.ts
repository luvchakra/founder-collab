import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-04 -- Suppliers export.

const mocks = vi.hoisted(() => ({ listSuppliersForExport: vi.fn() }));
vi.mock("./queries", () => ({ listSuppliersForExport: mocks.listSuppliersForExport }));

import { inventorySuppliersExport } from "./suppliers";
import { BUSINESS_ID, exportContext, requestParams, rowsOf } from "./test-support";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSuppliersForExport.mockResolvedValue([
    { id: "s1", org_id: BUSINESS_ID, name: "Bosch India", code: "BOS", contact_person: "Ravi", email: "ravi@bosch.test", phone: null, gst_number: "29AAACB1234C1Z1", address: null, city: "Bengaluru", state: "Karnataka", payment_terms: "Net 30", lead_time_days: 7, min_order_quantity: null, rating: 4, is_active: true, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" },
  ]);
});

describe("inventory.suppliers (EXP-INV-04)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventorySuppliersExport.id).toBe("inventory.suppliers");
    expect(inventorySuppliersExport.module).toBe("inventory");
    expect(inventorySuppliersExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only (tenant isolation)", async () => {
    await inventorySuppliersExport.load(exportContext(), inventorySuppliersExport.parseFilters!(requestParams()));
    expect(mocks.listSuppliersForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("exports supplier, contact, GSTIN, location and active; blank stays blank", async () => {
    const workbook = await inventorySuppliersExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Suppliers")[0]).toMatchObject({
      Supplier: "Bosch India",
      "Contact person": "Ravi",
      GSTIN: "29AAACB1234C1Z1",
      City: "Bengaluru",
      "Lead time (days)": 7,
      "Minimum order quantity": null,
      Phone: "",
      Active: true,
    });
  });
});
