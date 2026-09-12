import { describe, expect, it } from "vitest";
import {
  parseUsEconomicNexusThresholdValue,
  parseUsStateSalesTaxRateValue,
  usEconomicNexusThresholdRule,
  usStateSalesTaxRateRule,
} from "./us-sales-tax";

describe("usStateSalesTaxRateRule / usEconomicNexusThresholdRule", () => {
  it("builds a lineage keyed by state code as jurisdiction, SALES_TAX regime", () => {
    expect(usStateSalesTaxRateRule("CA")).toEqual({
      country: "US",
      jurisdiction: "CA",
      regime: "SALES_TAX",
      ruleKey: "state_sales_tax_rate",
    });
    expect(usEconomicNexusThresholdRule("NY")).toEqual({
      country: "US",
      jurisdiction: "NY",
      regime: "SALES_TAX",
      ruleKey: "economic_nexus_threshold",
    });
  });
});

describe("parseUsStateSalesTaxRateValue", () => {
  it("parses a well-formed value", () => {
    expect(parseUsStateSalesTaxRateValue({ ratePercent: 7.25, label: "California" })).toEqual({
      ratePercent: 7.25,
      label: "California",
    });
  });

  it("returns null for a missing/non-numeric ratePercent", () => {
    expect(parseUsStateSalesTaxRateValue({ label: "x" })).toBeNull();
    expect(parseUsStateSalesTaxRateValue({ ratePercent: "7.25" })).toBeNull();
  });
});

describe("parseUsEconomicNexusThresholdValue", () => {
  it("parses a revenue_only value with no transaction threshold", () => {
    const parsed = parseUsEconomicNexusThresholdValue({
      revenueThresholdUsd: 100000,
      transactionThreshold: null,
      thresholdLogic: "revenue_only",
    });
    expect(parsed).toEqual({ revenueThresholdUsd: 100000, transactionThreshold: null, thresholdLogic: "revenue_only", label: "Economic nexus threshold" });
  });

  it("parses a revenue_or_transactions value with a transaction threshold", () => {
    const parsed = parseUsEconomicNexusThresholdValue({
      revenueThresholdUsd: 100000,
      transactionThreshold: 200,
      thresholdLogic: "revenue_or_transactions",
    });
    expect(parsed?.transactionThreshold).toBe(200);
  });

  it("parses New York's own revenue_and_transactions AND-test shape", () => {
    const parsed = parseUsEconomicNexusThresholdValue({
      revenueThresholdUsd: 500000,
      transactionThreshold: 100,
      thresholdLogic: "revenue_and_transactions",
    });
    expect(parsed?.thresholdLogic).toBe("revenue_and_transactions");
  });

  it("returns null for an unrecognized thresholdLogic", () => {
    expect(
      parseUsEconomicNexusThresholdValue({ revenueThresholdUsd: 100000, transactionThreshold: null, thresholdLogic: "bogus" }),
    ).toBeNull();
  });

  it("returns null for a revenue_only row that also carries a transaction threshold (internally inconsistent)", () => {
    expect(
      parseUsEconomicNexusThresholdValue({ revenueThresholdUsd: 100000, transactionThreshold: 200, thresholdLogic: "revenue_only" }),
    ).toBeNull();
  });

  it("returns null for a non-revenue_only row missing its transaction threshold (internally inconsistent)", () => {
    expect(
      parseUsEconomicNexusThresholdValue({ revenueThresholdUsd: 100000, transactionThreshold: null, thresholdLogic: "revenue_or_transactions" }),
    ).toBeNull();
  });

  it("returns null for a missing/non-numeric revenueThresholdUsd", () => {
    expect(parseUsEconomicNexusThresholdValue({ thresholdLogic: "revenue_only", transactionThreshold: null })).toBeNull();
  });
});
