import { describe, expect, it } from "vitest";
import { determineSgProspectiveRegistrationObligation, determineSgRetrospectiveRegistrationObligation } from "./registration";
import type { ResolvedSgGstProspectiveGracePeriodRule, ResolvedSgGstRegistrationThresholdRule } from "./types";

const thresholdRule: ResolvedSgGstRegistrationThresholdRule = {
  thresholdSgd: 1_000_000,
  label: "GST registration threshold",
  rule: { id: "rule-threshold" } as ResolvedSgGstRegistrationThresholdRule["rule"],
};

const graceRule: ResolvedSgGstProspectiveGracePeriodRule = {
  months: 2,
  label: "Prospective registration GST-charging grace period",
  rule: { id: "rule-grace" } as ResolvedSgGstProspectiveGracePeriodRule["rule"],
};

describe("determineSgRetrospectiveRegistrationObligation", () => {
  it("is not obligated when turnover is exactly at the threshold (strict exceeds)", () => {
    const result = determineSgRetrospectiveRegistrationObligation(1_000_000, "2026-06-30", thresholdRule);
    expect(result).toMatchObject({ resolved: true, obligated: false, applicationDeadline: null });
  });

  it("is obligated when turnover exceeds the threshold, with a 30-day application deadline", () => {
    const result = determineSgRetrospectiveRegistrationObligation(1_200_000, "2026-06-30", thresholdRule);
    expect(result.obligated).toBe(true);
    expect(result.applicationDeadline).toBe("2026-07-30");
    expect(result.ruleRefs).toEqual(["rule-threshold"]);
  });

  it("returns unresolved when no threshold rule is on file", () => {
    const result = determineSgRetrospectiveRegistrationObligation(2_000_000, "2026-06-30", null);
    expect(result).toEqual({
      resolved: false,
      obligated: null,
      thresholdSgd: null,
      applicationDeadline: null,
      reason: "No GST registration threshold rule on file for this date.",
      ruleRefs: [],
    });
  });
});

describe("determineSgProspectiveRegistrationObligation", () => {
  it("is not obligated when the forecast is exactly at the threshold", () => {
    const result = determineSgProspectiveRegistrationObligation(1_000_000, "2026-03-15", thresholdRule, null);
    expect(result.obligated).toBe(false);
  });

  it("is obligated when the forecast exceeds the threshold, with a 30-day application deadline, no grace note before 1-Jul-2025-style rule resolution", () => {
    const result = determineSgProspectiveRegistrationObligation(1_500_000, "2024-01-15", thresholdRule, null);
    expect(result.obligated).toBe(true);
    expect(result.applicationDeadline).toBe("2024-02-14");
    expect(result.reason).not.toContain("grace period");
    expect(result.ruleRefs).toEqual(["rule-threshold"]);
  });

  it("includes the grace-period note and rule ref when a grace rule resolves for the forecast date", () => {
    const result = determineSgProspectiveRegistrationObligation(1_500_000, "2025-08-01", thresholdRule, graceRule);
    expect(result.obligated).toBe(true);
    expect(result.reason).toContain("2-month grace period");
    expect(result.ruleRefs).toEqual(["rule-threshold", "rule-grace"]);
  });

  it("does not include the grace rule ref when not obligated, even if a grace rule resolved", () => {
    const result = determineSgProspectiveRegistrationObligation(500_000, "2025-08-01", thresholdRule, graceRule);
    expect(result.obligated).toBe(false);
    expect(result.ruleRefs).toEqual(["rule-threshold"]);
  });

  it("returns unresolved when no threshold rule is on file", () => {
    const result = determineSgProspectiveRegistrationObligation(2_000_000, "2026-03-15", null, graceRule);
    expect(result.resolved).toBe(false);
    expect(result.obligated).toBeNull();
  });
});
