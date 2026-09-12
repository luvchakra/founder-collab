import { describe, expect, it } from "vitest";
import { determineEwayBillEligibility } from "./determine";
import type { TaxRule } from "../tax-rules/types";

function makeRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: "rule-1",
    country: "IN",
    jurisdiction: null,
    regime: "GST",
    rule_key: "eway_bill_consignment_value_threshold_inr",
    value: { thresholdInr: 50000 },
    version: 1,
    effective_from: "2018-04-01",
    effective_to: null,
    source: "test",
    treatment: null,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

describe("determineEwayBillEligibility", () => {
  it("is required when consignment value exceeds the threshold", () => {
    const result = determineEwayBillEligibility({ consignmentValueInr: 60000, thresholdInr: 50000, thresholdRule: makeRule() });
    expect(result.required).toBe(true);
    expect(result.reason).toContain("exceeds");
  });

  it("is not required (>, not >=) when consignment value exactly equals the threshold", () => {
    const result = determineEwayBillEligibility({ consignmentValueInr: 50000, thresholdInr: 50000, thresholdRule: makeRule() });
    expect(result.required).toBe(false);
  });

  it("is not required when consignment value is below the threshold", () => {
    const result = determineEwayBillEligibility({ consignmentValueInr: 10000, thresholdInr: 50000, thresholdRule: makeRule() });
    expect(result.required).toBe(false);
    expect(result.reason).toContain("at or below");
  });

  it("returns required: null (not false) when no threshold rule could be resolved", () => {
    const result = determineEwayBillEligibility({ consignmentValueInr: 60000, thresholdInr: null, thresholdRule: null });
    expect(result.required).toBeNull();
    expect(result.reason).toContain("rule");
  });

  it("returns required: null (not false) when no consignment value is available", () => {
    const result = determineEwayBillEligibility({ consignmentValueInr: null, thresholdInr: 50000, thresholdRule: makeRule() });
    expect(result.required).toBeNull();
    expect(result.reason).toContain("consignment value");
  });

  it("surfaces the underlying facts alongside the derived result", () => {
    const rule = makeRule();
    const result = determineEwayBillEligibility({ consignmentValueInr: 60000, thresholdInr: 50000, thresholdRule: rule });
    expect(result.thresholdInr).toBe(50000);
    expect(result.thresholdRule).toBe(rule);
    expect(result.consignmentValueInr).toBe(60000);
  });
});
