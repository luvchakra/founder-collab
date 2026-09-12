import { describe, expect, it } from "vitest";
import { determineEconomicNexus } from "./economic";
import type { UsEconomicNexusThresholdValue } from "../tax-rules/us-sales-tax";

const REVENUE_ONLY: UsEconomicNexusThresholdValue = { revenueThresholdUsd: 100000, transactionThreshold: null, thresholdLogic: "revenue_only", label: "x" };
const OR_TEST: UsEconomicNexusThresholdValue = { revenueThresholdUsd: 100000, transactionThreshold: 200, thresholdLogic: "revenue_or_transactions", label: "x" };
const AND_TEST: UsEconomicNexusThresholdValue = { revenueThresholdUsd: 500000, transactionThreshold: 100, thresholdLogic: "revenue_and_transactions", label: "x" };

describe("determineEconomicNexus -- revenue_only", () => {
  it("has nexus once sales strictly exceed the threshold", () => {
    expect(determineEconomicNexus({ salesUsd: 100001, transactionCount: null, threshold: REVENUE_ONLY }).hasNexus).toBe(true);
  });

  it("does not have nexus at exactly the threshold (must EXCEED, not meet)", () => {
    expect(determineEconomicNexus({ salesUsd: 100000, transactionCount: null, threshold: REVENUE_ONLY }).hasNexus).toBe(false);
  });

  it("returns null when sales are not declared", () => {
    expect(determineEconomicNexus({ salesUsd: null, transactionCount: null, threshold: REVENUE_ONLY }).hasNexus).toBeNull();
  });
});

describe("determineEconomicNexus -- revenue_or_transactions (OR test)", () => {
  it("has nexus when only revenue exceeds", () => {
    expect(determineEconomicNexus({ salesUsd: 200000, transactionCount: null, threshold: OR_TEST }).hasNexus).toBe(true);
  });

  it("has nexus when only transaction count exceeds, even with sales known and below threshold", () => {
    expect(determineEconomicNexus({ salesUsd: 5000, transactionCount: 250, threshold: OR_TEST }).hasNexus).toBe(true);
  });

  it("has no nexus only when BOTH known figures are below their own thresholds", () => {
    expect(determineEconomicNexus({ salesUsd: 5000, transactionCount: 10, threshold: OR_TEST }).hasNexus).toBe(false);
  });

  it("returns null when one figure is missing and the known one doesn't already prove nexus", () => {
    expect(determineEconomicNexus({ salesUsd: 5000, transactionCount: null, threshold: OR_TEST }).hasNexus).toBeNull();
    expect(determineEconomicNexus({ salesUsd: null, transactionCount: 10, threshold: OR_TEST }).hasNexus).toBeNull();
    expect(determineEconomicNexus({ salesUsd: null, transactionCount: null, threshold: OR_TEST }).hasNexus).toBeNull();
  });
});

describe("determineEconomicNexus -- revenue_and_transactions (AND test, New York's own shape)", () => {
  it("has nexus only when BOTH figures exceed their own thresholds", () => {
    expect(determineEconomicNexus({ salesUsd: 600000, transactionCount: 150, threshold: AND_TEST }).hasNexus).toBe(true);
  });

  it("has no nexus when revenue is known and below threshold, regardless of unknown transaction count", () => {
    expect(determineEconomicNexus({ salesUsd: 1000, transactionCount: null, threshold: AND_TEST }).hasNexus).toBe(false);
  });

  it("has no nexus when transaction count is known and below threshold, regardless of unknown revenue", () => {
    expect(determineEconomicNexus({ salesUsd: null, transactionCount: 5, threshold: AND_TEST }).hasNexus).toBe(false);
  });

  it("returns null when revenue exceeds but transaction count is unknown (cannot confirm the AND)", () => {
    expect(determineEconomicNexus({ salesUsd: 600000, transactionCount: null, threshold: AND_TEST }).hasNexus).toBeNull();
  });

  it("returns null when both figures are missing", () => {
    expect(determineEconomicNexus({ salesUsd: null, transactionCount: null, threshold: AND_TEST }).hasNexus).toBeNull();
  });
});
