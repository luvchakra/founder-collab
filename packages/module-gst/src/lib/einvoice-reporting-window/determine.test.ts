import { describe, expect, it } from "vitest";
import { addDays, determineEinvoiceReportingDeadline } from "./determine";
import type { TaxRule } from "../tax-rules/types";

function makeRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: "rule-1",
    country: "IN",
    jurisdiction: null,
    regime: "GST",
    rule_key: "einvoice_reporting_window_days",
    value: { aatoThresholdInr: 100000000, windowDays: 30 },
    version: 2,
    effective_from: "2025-04-01",
    effective_to: null,
    source: "test",
    treatment: null,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

describe("addDays", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-09-01", 10)).toBe("2026-09-11");
  });

  it("rolls over a month boundary", () => {
    expect(addDays("2026-09-15", 30)).toBe("2026-10-15");
  });

  it("rolls over a year boundary", () => {
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });
});

describe("determineEinvoiceReportingDeadline", () => {
  it("is not_restricted when turnover is below the AATO threshold", () => {
    const result = determineEinvoiceReportingDeadline({
      invoiceDate: "2026-09-01",
      aggregateTurnoverInr: 50000000,
      aatoThresholdInr: 100000000,
      windowDays: 30,
      rule: makeRule(),
    });
    expect(result.status).toBe("not_restricted");
    expect(result.deadline).toBeNull();
  });

  it("is restricted (>=) when turnover exactly equals the AATO threshold -- 'and above', not 'exceeding'", () => {
    const result = determineEinvoiceReportingDeadline({
      invoiceDate: "2026-09-01",
      asOf: "2026-09-05",
      aggregateTurnoverInr: 100000000,
      aatoThresholdInr: 100000000,
      windowDays: 30,
      rule: makeRule(),
    });
    expect(result.status).toBe("within_window");
  });

  it("is within_window when evaluated before the deadline", () => {
    const result = determineEinvoiceReportingDeadline({
      invoiceDate: "2026-09-01",
      asOf: "2026-09-20",
      aggregateTurnoverInr: 200000000,
      aatoThresholdInr: 100000000,
      windowDays: 30,
      rule: makeRule(),
    });
    expect(result.status).toBe("within_window");
    expect(result.deadline).toBe("2026-10-01");
  });

  it("is within_window when evaluated exactly on the deadline date", () => {
    const result = determineEinvoiceReportingDeadline({
      invoiceDate: "2026-09-01",
      asOf: "2026-10-01",
      aggregateTurnoverInr: 200000000,
      aatoThresholdInr: 100000000,
      windowDays: 30,
      rule: makeRule(),
    });
    expect(result.status).toBe("within_window");
  });

  it("is deadline_breached when evaluated after the deadline", () => {
    const result = determineEinvoiceReportingDeadline({
      invoiceDate: "2026-09-01",
      asOf: "2026-10-02",
      aggregateTurnoverInr: 200000000,
      aatoThresholdInr: 100000000,
      windowDays: 30,
      rule: makeRule(),
    });
    expect(result.status).toBe("deadline_breached");
    expect(result.reason).toContain("closed");
  });

  it("returns unknown (not not_restricted) when no rule could be resolved", () => {
    const result = determineEinvoiceReportingDeadline({
      invoiceDate: "2026-09-01",
      aggregateTurnoverInr: 200000000,
      aatoThresholdInr: null,
      windowDays: null,
      rule: null,
    });
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("rule");
  });

  it("returns unknown (not not_restricted) when no turnover figure is available", () => {
    const result = determineEinvoiceReportingDeadline({
      invoiceDate: "2026-09-01",
      aggregateTurnoverInr: null,
      aatoThresholdInr: 100000000,
      windowDays: 30,
      rule: makeRule(),
    });
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("turnover");
  });
});
