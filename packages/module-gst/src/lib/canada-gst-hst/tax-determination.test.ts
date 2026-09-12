import { describe, expect, it } from "vitest";
import { determineCaGstHstTax } from "./tax-determination";
import type { ResolvedGstHstRateRule, ResolvedProvincialSalesTaxRule } from "./types";

function gstHstRule(overrides: Partial<ResolvedGstHstRateRule> = {}): ResolvedGstHstRateRule {
  return {
    ratePercent: 13,
    taxModel: "hst",
    label: "Ontario HST",
    rule: { id: "rule-on", jurisdiction: "ON" } as never,
    ...overrides,
  };
}

describe("determineCaGstHstTax", () => {
  it("an hst province reports the combined rate with no separate provincial component", () => {
    const result = determineCaGstHstTax(gstHstRule(), null);
    expect(result).toMatchObject({ province: "ON", taxModel: "hst", gstRatePercent: 13, provincialRatePercent: null, totalRatePercent: 13, ruleRefs: ["rule-on"] });
  });

  it("a gst_pst province sums the federal GST and the separate provincial rate", () => {
    const provincialRule: ResolvedProvincialSalesTaxRule = { ratePercent: 7, taxLabel: "PST", label: "BC PST", rule: { id: "rule-bc-pst" } as never };
    const result = determineCaGstHstTax(gstHstRule({ ratePercent: 5, taxModel: "gst_pst", rule: { id: "rule-bc-gst", jurisdiction: "BC" } as never }), provincialRule);
    expect(result).toMatchObject({ province: "BC", taxModel: "gst_pst", gstRatePercent: 5, provincialRatePercent: 7, totalRatePercent: 12, ruleRefs: ["rule-bc-gst", "rule-bc-pst"] });
  });

  it("a gst_pst province with no provincial rule on file falls back to GST alone, no provincial component", () => {
    const result = determineCaGstHstTax(gstHstRule({ ratePercent: 5, taxModel: "gst_pst", rule: { id: "rule-bc-gst", jurisdiction: "BC" } as never }), null);
    expect(result).toMatchObject({ provincialRatePercent: null, totalRatePercent: 5, ruleRefs: ["rule-bc-gst"] });
  });

  it("a gst_only jurisdiction reports the plain 5% GST with no provincial component", () => {
    const result = determineCaGstHstTax(gstHstRule({ ratePercent: 5, taxModel: "gst_only", rule: { id: "rule-ab-gst", jurisdiction: "AB" } as never }), null);
    expect(result).toMatchObject({ province: "AB", taxModel: "gst_only", provincialRatePercent: null, totalRatePercent: 5 });
  });
});
