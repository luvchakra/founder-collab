import { describe, expect, it } from "vitest";
import {
  filingFrequencyThresholdRule,
  gstHstRateRule,
  parseFilingFrequencyThresholdValue,
  parseGstHstRateValue,
  parseProvincialSalesTaxValue,
  parseSmallSupplierThresholdValue,
  provincialSalesTaxRule,
  smallSupplierThresholdRule,
} from "./rules";

describe("lineage builders", () => {
  it("gstHstRateRule/provincialSalesTaxRule key by province", () => {
    expect(gstHstRateRule("ON")).toEqual({ country: "CA", jurisdiction: "ON", regime: "GST_HST", ruleKey: "gst_hst_rate" });
    expect(provincialSalesTaxRule("BC")).toEqual({ country: "CA", jurisdiction: "BC", regime: "GST_HST", ruleKey: "provincial_sales_tax_rate" });
  });

  it("smallSupplierThresholdRule/filingFrequencyThresholdRule are national (jurisdiction: null)", () => {
    expect(smallSupplierThresholdRule()).toEqual({ country: "CA", jurisdiction: null, regime: "GST_HST", ruleKey: "small_supplier_threshold_cad" });
    expect(filingFrequencyThresholdRule()).toEqual({ country: "CA", jurisdiction: null, regime: "GST_HST", ruleKey: "gst_hst_filing_frequency_threshold_cad" });
  });
});

describe("parseGstHstRateValue", () => {
  it("parses a well-formed value", () => {
    expect(parseGstHstRateValue({ ratePercent: 13, taxModel: "hst", label: "Ontario HST" })).toEqual({ ratePercent: 13, taxModel: "hst", label: "Ontario HST" });
  });

  it("rejects an unrecognized taxModel", () => {
    expect(parseGstHstRateValue({ ratePercent: 13, taxModel: "vat" })).toBeNull();
  });

  it("rejects a missing taxModel entirely", () => {
    expect(parseGstHstRateValue({ ratePercent: 13 })).toBeNull();
  });

  it("rejects a non-numeric ratePercent", () => {
    expect(parseGstHstRateValue({ ratePercent: "13", taxModel: "hst" })).toBeNull();
  });
});

describe("parseProvincialSalesTaxValue", () => {
  it("parses a well-formed value and defaults taxLabel/label", () => {
    expect(parseProvincialSalesTaxValue({ ratePercent: 7 })).toEqual({ ratePercent: 7, taxLabel: "PST", label: "Provincial sales tax rate" });
  });

  it("rejects a non-numeric ratePercent", () => {
    expect(parseProvincialSalesTaxValue({ ratePercent: "seven" })).toBeNull();
  });
});

describe("parseSmallSupplierThresholdValue", () => {
  it("parses a well-formed value", () => {
    expect(parseSmallSupplierThresholdValue({ thresholdCad: 30000 })?.thresholdCad).toBe(30000);
  });

  it("rejects a non-numeric thresholdCad", () => {
    expect(parseSmallSupplierThresholdValue({ thresholdCad: "30000" })).toBeNull();
  });
});

describe("parseFilingFrequencyThresholdValue", () => {
  it("parses a well-formed value", () => {
    expect(parseFilingFrequencyThresholdValue({ annualThresholdCad: 1500000, quarterlyThresholdCad: 6000000 })).toMatchObject({
      annualThresholdCad: 1500000,
      quarterlyThresholdCad: 6000000,
    });
  });

  it("rejects an internally-inconsistent value where quarterly <= annual", () => {
    expect(parseFilingFrequencyThresholdValue({ annualThresholdCad: 6000000, quarterlyThresholdCad: 1500000 })).toBeNull();
  });

  it("rejects a missing quarterlyThresholdCad", () => {
    expect(parseFilingFrequencyThresholdValue({ annualThresholdCad: 1500000 })).toBeNull();
  });
});
