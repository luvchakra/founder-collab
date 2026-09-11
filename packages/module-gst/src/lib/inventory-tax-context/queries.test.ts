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
    });
  });

  it("passes through a null sku/hsn_code (a service item, say, has neither)", () => {
    const item = mapItemTaxContext({
      id: "item-2",
      kind: "service",
      sku: null,
      name: "Installation",
      unit: "job",
      hsn_code: null,
      tax_rate: 18,
      status: "active",
    });
    expect(item.sku).toBeNull();
    expect(item.hsnCode).toBeNull();
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
      });
      expect(item.kind).toBe(kind);
    }
  });
});
