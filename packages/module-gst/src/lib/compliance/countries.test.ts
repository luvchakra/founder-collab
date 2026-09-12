import { describe, expect, it } from "vitest";
import { COUNTRY_CATALOG, defaultRegimeFor, getCountry, isCountrySupported, isRegimeSupported } from "./countries";

describe("compliance country catalog", () => {
  it("has no duplicate country codes", () => {
    const codes = COUNTRY_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every entry has at least one regime", () => {
    for (const c of COUNTRY_CATALOG) {
      expect(c.regimes.length).toBeGreaterThan(0);
    }
  });

  it("India, the US, and COMPLY-P1-01's five EU country packs are the currently-supported countries", () => {
    const supported = COUNTRY_CATALOG.filter((c) => c.status === "supported").map((c) => c.code);
    expect(supported.sort()).toEqual(["BE", "DE", "FR", "IN", "IT", "PL", "US"]);
  });

  it("getCountry finds a known code and misses an unknown one", () => {
    expect(getCountry("IN")?.name).toBe("India");
    expect(getCountry("DE")?.name).toBe("Germany");
    expect(getCountry("US")?.name).toBe("United States");
    expect(getCountry("ZZ")).toBeUndefined();
  });

  it("isCountrySupported is true for India, the US, and the five COMPLY-P1-01 EU country packs, false for everything else", () => {
    expect(isCountrySupported("IN")).toBe(true);
    expect(isCountrySupported("US")).toBe(true);
    for (const code of ["DE", "FR", "BE", "PL", "IT"]) {
      expect(isCountrySupported(code)).toBe(true);
    }
    expect(isCountrySupported("CA")).toBe(false); // Canada -- still planned
    expect(isCountrySupported("NL")).toBe(false); // a real EU member state with no country pack yet
    expect(isCountrySupported("ZZ")).toBe(false);
  });

  it("isRegimeSupported requires both a supported country and a real regime of that country's own catalog entry", () => {
    expect(isRegimeSupported("IN", "GST")).toBe(true);
    expect(isRegimeSupported("IN", "VAT")).toBe(false); // real regime, wrong country
    expect(isRegimeSupported("DE", "VAT")).toBe(true);
    expect(isRegimeSupported("DE", "GST")).toBe(false); // real regime, wrong country
    expect(isRegimeSupported("US", "SALES_TAX")).toBe(true);
    expect(isRegimeSupported("CA", "GST_HST")).toBe(false); // real regime, unsupported country (Canada still planned)
    expect(isRegimeSupported("ZZ", "GST")).toBe(false);
  });

  it("defaultRegimeFor returns each supported country's own regime and nothing for an unknown country", () => {
    expect(defaultRegimeFor("IN")).toBe("GST");
    expect(defaultRegimeFor("DE")).toBe("VAT");
    expect(defaultRegimeFor("US")).toBe("SALES_TAX");
    expect(defaultRegimeFor("ZZ")).toBeUndefined();
  });
});
