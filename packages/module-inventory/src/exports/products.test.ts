import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-02 -- Products export, including cost gating both ways.

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(),
  listProductsForExport: vi.fn(),
  listCategoryNamesForExport: vi.fn(),
  listActiveSupplierNamesForExport: vi.fn(),
}));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ hasPermission: mocks.hasPermission }));
vi.mock("./queries", () => ({
  listProductsForExport: mocks.listProductsForExport,
  listCategoryNamesForExport: mocks.listCategoryNamesForExport,
  listActiveSupplierNamesForExport: mocks.listActiveSupplierNamesForExport,
}));

import { renderExport } from "@cofounderai/core/exports/render";
import { inventoryProductsExport } from "./products";
import { BUSINESS_ID, exportContext, headers, requestParams, rowsOf, serialized } from "./test-support";

const PRODUCT = {
  id: "prod-1",
  org_id: BUSINESS_ID,
  sku: "DRL-001",
  name: "Cordless drill",
  description: null,
  category_id: "cat-1",
  supplier_id: "sup-1",
  unit: "pcs",
  hsn_code: "8467",
  tax_rate: 18,
  cost_price: 4321.5,
  selling_price: 6999,
  reorder_point: 5,
  reorder_quantity: 20,
  barcode: null,
  image_url: "https://storage.example/signed?token=abc",
  status: "active",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  brand: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listProductsForExport.mockImplementation(async (_b: string, canViewCost: boolean) => [{ ...PRODUCT, cost_price: canViewCost ? PRODUCT.cost_price : null }]);
  mocks.listCategoryNamesForExport.mockResolvedValue(new Map([["cat-1", "Power tools"]]));
  mocks.listActiveSupplierNamesForExport.mockResolvedValue(new Map([["sup-1", "Bosch India"]]));
});

describe("inventory.products (EXP-INV-02)", () => {
  it("is licensed and permissioned like the Inventory pages", () => {
    expect(inventoryProductsExport.id).toBe("inventory.products");
    expect(inventoryProductsExport.module).toBe("inventory");
    expect(inventoryProductsExport.permissions).toEqual(["inventory.view"]);
  });

  it("reads the resolved business only and ignores unknown params (tenant isolation)", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const filters = inventoryProductsExport.parseFilters!(requestParams({ imported: "3", status: "inactive" }));
    expect(filters).toEqual({});
    await inventoryProductsExport.load(exportContext(), filters);
    expect(mocks.hasPermission).toHaveBeenCalledWith(BUSINESS_ID, "inventory.view_cost");
    expect(mocks.listProductsForExport).toHaveBeenCalledWith(BUSINESS_ID, false);
    expect(mocks.listCategoryNamesForExport).toHaveBeenCalledWith(BUSINESS_ID);
    expect(mocks.listActiveSupplierNamesForExport).toHaveBeenCalledWith(BUSINESS_ID);
  });

  it("with inventory.view_cost: includes the cost price column", async () => {
    mocks.hasPermission.mockResolvedValue(true);
    const workbook = await inventoryProductsExport.load(exportContext(), {});
    expect(headers(workbook, "Products")).toContain("Cost price");
    expect(rowsOf(workbook, "Products")[0]).toMatchObject({ "Cost price": 4321.5, "Selling price": 6999 });
  });

  it("without inventory.view_cost: drops the column entirely (not blanked)", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const workbook = await inventoryProductsExport.load(exportContext(), {});
    expect(headers(workbook, "Products")).toEqual([
      "SKU",
      "Name",
      "Brand",
      "Category",
      "Supplier",
      "Unit",
      "HSN code",
      "Tax rate",
      "Barcode",
      "Selling price",
      "Reorder point",
      "Reorder quantity",
      "Status",
      "Created",
    ]);
    expect(serialized(workbook)).not.toContain("4321");
    const csv = new TextDecoder().decode(
      (await renderExport(workbook, "csv", { timeZone: "Asia/Kolkata", generatedAt: new Date("2026-09-26T00:00:00Z") })).body,
    );
    expect(csv).not.toContain("Cost");
    expect(csv).not.toContain("4321");
  });

  it("writes labels and fractions, and never the image URL", async () => {
    mocks.hasPermission.mockResolvedValue(false);
    const workbook = await inventoryProductsExport.load(exportContext(), {});
    expect(rowsOf(workbook, "Products")[0]).toMatchObject({
      SKU: "DRL-001",
      Brand: "",
      Category: "Power tools",
      Supplier: "Bosch India",
      "Tax rate": 0.18,
      Barcode: "",
      Status: "Active",
    });
    expect(serialized(workbook)).not.toContain("signed");
  });
});
