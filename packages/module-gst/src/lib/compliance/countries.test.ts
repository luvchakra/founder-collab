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

  it("India is the only P0-supported country", () => {
    const supported = COUNTRY_CATALOG.filter((c) => c.status === "supported").map((c) => c.code);
    expect(supported).toEqual(["IN"]);
  });

  it("getCountry finds a known code and misses an unknown one", () => {
    expect(getCountry("IN")?.name).toBe("India");
    expect(getCountry("ZZ")).toBeUndefined();
  });

  it("isCountrySupported is true only for India in P0", () => {
    expect(isCountrySupported("IN")).toBe(true);
    expect(isCountrySupported("US")).toBe(false);
    expect(isCountrySupported("ZZ")).toBe(false);
  });

  it("isRegimeSupported requires both a supported country and a real regime of that country's own catalog entry", () => {
    expect(isRegimeSupported("IN", "GST")).toBe(true);
    expect(isRegimeSupported("IN", "VAT")).toBe(false); // real regime, wrong country
    expect(isRegimeSupported("US", "SALES_TAX")).toBe(false); // real regime, unsupported country
    expect(isRegimeSupported("ZZ", "GST")).toBe(false);
  });

  it("defaultRegimeFor returns India's GST and nothing for an unknown country", () => {
    expect(defaultRegimeFor("IN")).toBe("GST");
    expect(defaultRegimeFor("ZZ")).toBeUndefined();
  });
});
