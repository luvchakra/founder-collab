import { describe, expect, it } from "vitest";
import {
  euVatReducedRatesRule,
  euVatStandardRateRule,
  parseEuVatReducedRatesValue,
  parseEuVatStandardRateValue,
} from "./eu-vat-rates";

describe("euVatStandardRateRule / euVatReducedRatesRule", () => {
  it("builds a lineage keyed by country, VAT regime, no jurisdiction", () => {
    expect(euVatStandardRateRule("DE")).toEqual({
      country: "DE",
      jurisdiction: null,
      regime: "VAT",
      ruleKey: "vat_standard_rate",
    });
    expect(euVatReducedRatesRule("FR")).toEqual({
      country: "FR",
      jurisdiction: null,
      regime: "VAT",
      ruleKey: "vat_reduced_rates",
    });
  });
});

describe("parseEuVatStandardRateValue", () => {
  it("parses a well-formed value", () => {
    expect(parseEuVatStandardRateValue({ ratePercent: 19, label: "Standard VAT rate" })).toEqual({
      ratePercent: 19,
      label: "Standard VAT rate",
    });
  });

  it("defaults the label when missing or blank", () => {
    expect(parseEuVatStandardRateValue({ ratePercent: 20 })).toEqual({ ratePercent: 20, label: "Standard VAT rate" });
    expect(parseEuVatStandardRateValue({ ratePercent: 20, label: "  " })).toEqual({
      ratePercent: 20,
      label: "Standard VAT rate",
    });
  });

  it("returns null when ratePercent is missing or not a finite number", () => {
    expect(parseEuVatStandardRateValue({ label: "x" })).toBeNull();
    expect(parseEuVatStandardRateValue({ ratePercent: "19" })).toBeNull();
    expect(parseEuVatStandardRateValue({ ratePercent: Number.NaN })).toBeNull();
  });
});

describe("parseEuVatReducedRatesValue", () => {
  it("parses a well-formed multi-entry value (France's own 10/5.5/2.1 shape)", () => {
    const parsed = parseEuVatReducedRatesValue({
      rates: [
        { ratePercent: 10, label: "Intermediate" },
        { ratePercent: 5.5, label: "Reduced" },
        { ratePercent: 2.1, label: "Super-reduced" },
      ],
      label: "Reduced VAT rates",
    });
    expect(parsed?.rates).toHaveLength(3);
    expect(parsed?.rates[1]).toEqual({ ratePercent: 5.5, label: "Reduced" });
  });

  it("defaults a missing per-entry label", () => {
    const parsed = parseEuVatReducedRatesValue({ rates: [{ ratePercent: 7 }] });
    expect(parsed?.rates[0]).toEqual({ ratePercent: 7, label: "Reduced VAT rate" });
  });

  it("returns null when rates is missing, empty, or not an array", () => {
    expect(parseEuVatReducedRatesValue({ label: "x" })).toBeNull();
    expect(parseEuVatReducedRatesValue({ rates: [] })).toBeNull();
    expect(parseEuVatReducedRatesValue({ rates: "7" })).toBeNull();
  });

  it("returns null when any entry is malformed", () => {
    expect(parseEuVatReducedRatesValue({ rates: [{ ratePercent: 7 }, { ratePercent: "bad" }] })).toBeNull();
    expect(parseEuVatReducedRatesValue({ rates: [null] })).toBeNull();
  });
});
