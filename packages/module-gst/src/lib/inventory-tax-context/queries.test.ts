import { describe, expect, it } from "vitest";
import { mapItemTaxContext } from "./queries";

describe("inventory tax context mapping", () => {
  it("translates a core.items row to camelCase classification fields", () => {
    const item = mapItemTaxContext({
      id: "item-1",
      kind: "good",
      sku: "WID-001",
      name: "Widget",
      unit: "pcs",
      hsn_code: "8471",
      tax_rate: 18,
      status: "active",
      category_id: "cat-1",
    });
    expect(item).toEqual({
      id: "item-1",
      kind: "good",
      sku: "WID-001",
      name: "Widget",
      unit: "pcs",
      hsnCode: "8471",
      taxRate: 18,
      status: "active",
      categoryId: "cat-1",
    });
  });

  it("passes through a null sku/hsn_code/category_id (a service item, say, has none)", () => {
    const item = mapItemTaxContext({
      id: "item-2",
      kind: "service",
      sku: null,
      name: "Installation",
      unit: "job",
      hsn_code: null,
      tax_rate: 18,
      status: "active",
      category_id: null,
    });
    expect(item.sku).toBeNull();
    expect(item.hsnCode).toBeNull();
    expect(item.categoryId).toBeNull();
    expect(item.kind).toBe("service");
  });

  it("preserves every item kind the platform's own check constraint allows", () => {
    for (const kind of ["good", "service", "labour", "part", "expense"]) {
      const item = mapItemTaxContext({
        id: "item-x",
        kind,
        sku: null,
        name: "X",
        unit: "pcs",
        hsn_code: null,
        tax_rate: 0,
        status: "active",
        category_id: null,
      });
      expect(item.kind).toBe(kind);
    }
  });
});
