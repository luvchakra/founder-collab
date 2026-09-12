import { describe, expect, it } from "vitest";
import { determineEinvoiceEligibility } from "./determine";
import type { TaxRule } from "../tax-rules/types";

function makeRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: "rule-1",
    country: "IN",
    jurisdiction: null,
    regime: "GST",
    rule_key: "einvoice_turnover_threshold_inr",
    value: { thresholdInr: 50000000 },
    version: 2,
    effective_from: "2023-08-01",
    effective_to: null,
    source: "test",
    treatment: null,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

describe("determineEinvoiceEligibility", () => {
  it("mandates e-invoicing when turnover exceeds the threshold", () => {
    const result = determineEinvoiceEligibility({
      turnoverInr: 60000000,
      turnoverSource: "declared",
      thresholdInr: 50000000,
      thresholdRule: makeRule(),
      selfDeclaredEligible: null,
    });
    expect(result.mandated).toBe(true);
    expect(result.reason).toContain("exceeds");
  });

  it("does not mandate when turnover is below the threshold", () => {
    const result = determineEinvoiceEligibility({
      turnoverInr: 10000000,
      turnoverSource: "estimated_from_documents",
      thresholdInr: 50000000,
      thresholdRule: makeRule(),
      selfDeclaredEligible: null,
    });
    expect(result.mandated).toBe(false);
  });

  it("does not mandate when turnover exactly equals the threshold (must EXCEED, not meet)", () => {
    const result = determineEinvoiceEligibility({
      turnoverInr: 50000000,
      turnoverSource: "declared",
      thresholdInr: 50000000,
      thresholdRule: makeRule(),
      selfDeclaredEligible: null,
    });
    expect(result.mandated).toBe(false);
  });

  it("mandates outright when the business has historically crossed the threshold, even below it now", () => {
    const result = determineEinvoiceEligibility({
      turnoverInr: 1000000,
      turnoverSource: "declared",
      thresholdInr: 50000000,
      thresholdRule: makeRule(),
      everCrossedThresholdHistorically: true,
      selfDeclaredEligible: null,
    });
    expect(result.mandated).toBe(true);
    expect(result.reason).toContain("earlier financial year");
  });

  it("returns mandated: null (not false) when no threshold rule could be resolved", () => {
    const result = determineEinvoiceEligibility({
      turnoverInr: 60000000,
      turnoverSource: "declared",
      thresholdInr: null,
      thresholdRule: null,
      selfDeclaredEligible: null,
    });
    expect(result.mandated).toBeNull();
    expect(result.reason).toContain("threshold rule");
  });

  it("returns mandated: null (not false) when no turnover figure is available", () => {
    const result = determineEinvoiceEligibility({
      turnoverInr: null,
      turnoverSource: "estimated_from_documents",
      thresholdInr: 50000000,
      thresholdRule: makeRule(),
      selfDeclaredEligible: null,
    });
    expect(result.mandated).toBeNull();
    expect(result.reason).toContain("turnover figure");
  });

  it("passes through the self-declared flag and turnover source unchanged", () => {
    const result = determineEinvoiceEligibility({
      turnoverInr: 60000000,
      turnoverSource: "estimated_from_documents",
      thresholdInr: 50000000,
      thresholdRule: makeRule(),
      selfDeclaredEligible: true,
    });
    expect(result.selfDeclaredEligible).toBe(true);
    expect(result.turnoverSource).toBe("estimated_from_documents");
  });
});
