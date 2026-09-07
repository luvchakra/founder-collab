import { describe, expect, it } from "vitest";
import { parseProductsCsv } from "./csv";

describe("parseProductsCsv", () => {
  it("parses a well-formed CSV with a header row", () => {
    const csv = "sku,name,brand,tax_rate\nSKU-1,Widget,Acme,18\nSKU-2,Gadget,,5";
    const { rows, errors } = parseProductsCsv(csv, new Map());
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sku: "SKU-1", name: "Widget", brand: "Acme", tax_rate: 18 });
    expect(rows[1]).toMatchObject({ sku: "SKU-2", name: "Gadget", brand: null, tax_rate: 5 });
  });

  it("requires sku and name columns", () => {
    const { rows, errors } = parseProductsCsv("brand,unit\nAcme,pcs", new Map());
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/Missing required column/);
  });

  it("skips rows missing sku or name and reports why", () => {
    const csv = "sku,name\nSKU-1,\n,Gadget";
    const { rows, errors } = parseProductsCsv(csv, new Map());
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
  });

  it("rejects a GST rate outside the valid slabs", () => {
    const csv = "sku,name,tax_rate\nSKU-1,Widget,7";
    const { rows, errors } = parseProductsCsv(csv, new Map());
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/GST rate/);
  });

  it("resolves supplier by name against the provided lookup map", () => {
    const csv = "sku,name,supplier\nSKU-1,Widget,Acme Traders";
    const { rows } = parseProductsCsv(
      csv,
      new Map([["acme traders", "11111111-1111-1111-1111-111111111111"]]),
    );
    expect(rows[0]?.supplier_id).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("leaves supplier unset when the name doesn't match", () => {
    const csv = "sku,name,supplier\nSKU-1,Widget,Unknown Co";
    const { rows } = parseProductsCsv(csv, new Map());
    expect(rows[0]?.supplier_id).toBeNull();
  });
});
