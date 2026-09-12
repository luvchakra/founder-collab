import { describe, expect, it } from "vitest";
import { parseUsProductTaxabilityRuleValue, usProductTaxabilityRule } from "./rules";

describe("usProductTaxabilityRule", () => {
  it("builds the lineage key for a state/category pair", () => {
    expect(usProductTaxabilityRule("PA", "clothing")).toEqual({
      country: "US",
      jurisdiction: "PA",
      regime: "SALES_TAX",
      ruleKey: "product_taxability_clothing",
    });
  });
});

describe("parseUsProductTaxabilityRuleValue", () => {
  it("parses an exempt rule with an explicit rate of 0", () => {
    expect(parseUsProductTaxabilityRuleValue({ treatment: "exempt", ratePercent: 0, label: "Clothing exempt" })).toEqual({
      treatment: "exempt",
      ratePercent: 0,
      label: "Clothing exempt",
    });
  });

  it("parses a rule with no rate at all (ratePercent omitted -> null)", () => {
    expect(parseUsProductTaxabilityRuleValue({ treatment: "standard" })).toEqual({
      treatment: "standard",
      ratePercent: null,
      label: "Product/service taxability",
    });
  });

  it("defaults a missing/blank label", () => {
    expect(parseUsProductTaxabilityRuleValue({ treatment: "exempt", label: "  " })?.label).toBe("Product/service taxability");
  });

  it("rejects an unrecognized treatment code", () => {
    expect(parseUsProductTaxabilityRuleValue({ treatment: "half_off" })).toBeNull();
  });

  it("rejects a non-numeric ratePercent", () => {
    expect(parseUsProductTaxabilityRuleValue({ treatment: "reduced", ratePercent: "low" })).toBeNull();
  });

  it("rejects a missing treatment entirely", () => {
    expect(parseUsProductTaxabilityRuleValue({ ratePercent: 5 })).toBeNull();
  });
});
