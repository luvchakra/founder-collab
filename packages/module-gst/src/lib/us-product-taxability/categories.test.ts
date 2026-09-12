import { describe, expect, it } from "vitest";
import {
  US_PRODUCT_TAX_CATEGORY_CATALOG,
  defaultUsProductTaxCategoryForKind,
  getUsProductTaxCategory,
  isUsProductTaxCategorySupported,
} from "./categories";

describe("US_PRODUCT_TAX_CATEGORY_CATALOG", () => {
  it("has exactly the seven categories this story defines, no duplicates", () => {
    const codes = US_PRODUCT_TAX_CATEGORY_CATALOG.map((c) => c.code);
    expect(codes).toEqual(["general", "clothing", "groceries", "prepared_food", "digital_goods", "saas", "services"]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every entry has a name and description", () => {
    for (const entry of US_PRODUCT_TAX_CATEGORY_CATALOG) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("only saas/services are marked as having no safe general-rate default", () => {
    const noDefault = US_PRODUCT_TAX_CATEGORY_CATALOG.filter((c) => !c.defaultsToGeneralRate).map((c) => c.code);
    expect(noDefault.sort()).toEqual(["saas", "services"]);
  });
});

describe("getUsProductTaxCategory / isUsProductTaxCategorySupported", () => {
  it("finds a known category", () => {
    expect(getUsProductTaxCategory("clothing")?.name).toBe("Clothing and footwear");
    expect(isUsProductTaxCategorySupported("clothing")).toBe(true);
  });

  it("misses an unknown category", () => {
    expect(getUsProductTaxCategory("furniture")).toBeUndefined();
    expect(isUsProductTaxCategorySupported("furniture")).toBe(false);
  });
});

describe("defaultUsProductTaxCategoryForKind", () => {
  it("maps good/part to general", () => {
    expect(defaultUsProductTaxCategoryForKind("good")).toBe("general");
    expect(defaultUsProductTaxCategoryForKind("part")).toBe("general");
  });

  it("maps service/labour to services", () => {
    expect(defaultUsProductTaxCategoryForKind("service")).toBe("services");
    expect(defaultUsProductTaxCategoryForKind("labour")).toBe("services");
  });

  it("maps expense to null -- product taxability is not a question for it", () => {
    expect(defaultUsProductTaxCategoryForKind("expense")).toBeNull();
  });
});
