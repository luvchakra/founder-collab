import { describe, expect, it } from "vitest";
import { CA_PROVINCES, getCaProvince, isCaProvince, resolveCaProvinceCode } from "./ca-provinces";

describe("CA_PROVINCES catalog", () => {
  it("has exactly 13 entries (10 provinces + 3 territories) with no duplicate codes", () => {
    expect(CA_PROVINCES.length).toBe(13);
    expect(new Set(CA_PROVINCES.map((p) => p.code)).size).toBe(13);
  });

  it("exactly 5 provinces use the hst tax model", () => {
    const hst = CA_PROVINCES.filter((p) => p.taxModel === "hst").map((p) => p.code);
    expect(hst.sort()).toEqual(["NB", "NL", "NS", "ON", "PE"]);
  });

  it("exactly 4 provinces use the gst_pst tax model", () => {
    const gstPst = CA_PROVINCES.filter((p) => p.taxModel === "gst_pst").map((p) => p.code);
    expect(gstPst.sort()).toEqual(["BC", "MB", "QC", "SK"]);
  });

  it("exactly 4 jurisdictions (1 province + 3 territories) use the gst_only tax model", () => {
    const gstOnly = CA_PROVINCES.filter((p) => p.taxModel === "gst_only").map((p) => p.code);
    expect(gstOnly.sort()).toEqual(["AB", "NT", "NU", "YT"]);
  });

  it("isCaProvince/getCaProvince correctly reject an unknown code", () => {
    expect(isCaProvince("ZZ")).toBe(false);
    expect(getCaProvince("ZZ")).toBeUndefined();
  });
});

describe("resolveCaProvinceCode", () => {
  it("passes through an already-correct code, case-insensitively", () => {
    expect(resolveCaProvinceCode("ON")).toBe("ON");
    expect(resolveCaProvinceCode("on")).toBe("ON");
  });

  it("resolves a full province/territory name in any casing", () => {
    expect(resolveCaProvinceCode("Ontario")).toBe("ON");
    expect(resolveCaProvinceCode("british columbia")).toBe("BC");
    expect(resolveCaProvinceCode("Newfoundland and Labrador")).toBe("NL");
  });

  it("tolerates surrounding whitespace", () => {
    expect(resolveCaProvinceCode("  Quebec  ")).toBe("QC");
  });

  it("returns null for an unrecognized value, an empty string, and null/undefined", () => {
    expect(resolveCaProvinceCode("California")).toBeNull();
    expect(resolveCaProvinceCode("")).toBeNull();
    expect(resolveCaProvinceCode(null)).toBeNull();
    expect(resolveCaProvinceCode(undefined)).toBeNull();
  });
});
