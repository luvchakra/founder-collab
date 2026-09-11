import { describe, expect, it } from "vitest";
import { TAX_TREATMENT_CATALOG, getTreatment, isTreatmentSupported } from "./treatments";

describe("compliance tax treatment catalog", () => {
  it("has the backlog's own eight universal treatment categories, no duplicates", () => {
    const codes = TAX_TREATMENT_CATALOG.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort()).toEqual(
      ["export", "exempt", "import", "out_of_scope", "reduced", "reverse_charge", "standard", "zero_rated"].sort(),
    );
  });

  it("every entry has a name and a non-blank description", () => {
    for (const t of TAX_TREATMENT_CATALOG) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("getTreatment finds a known code and misses an unknown one", () => {
    expect(getTreatment("zero_rated")?.name).toBe("Zero-rated");
    expect(getTreatment("bogus")).toBeUndefined();
  });

  it("isTreatmentSupported is true only for a real catalog code", () => {
    expect(isTreatmentSupported("standard")).toBe(true);
    expect(isTreatmentSupported("reverse_charge")).toBe(true);
    expect(isTreatmentSupported("discounted")).toBe(false);
    expect(isTreatmentSupported("")).toBe(false);
  });
});
