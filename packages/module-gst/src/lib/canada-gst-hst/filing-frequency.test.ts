import { describe, expect, it } from "vitest";
import { determineGstHstFilingFrequency } from "./filing-frequency";
import type { ResolvedFilingFrequencyThresholdRule } from "./types";

const threshold: ResolvedFilingFrequencyThresholdRule = {
  annualThresholdCad: 1500000,
  quarterlyThresholdCad: 6000000,
  label: "filing frequency thresholds",
  rule: { id: "rule-freq" } as never,
};

describe("determineGstHstFilingFrequency", () => {
  it("unresolved when no threshold rule is on file", () => {
    expect(determineGstHstFilingFrequency(2000000, null)).toMatchObject({ resolved: false, frequency: null, ruleRefs: [] });
  });

  it("revenue at or below the annual threshold is annual", () => {
    expect(determineGstHstFilingFrequency(1500000, threshold).frequency).toBe("annual");
    expect(determineGstHstFilingFrequency(100000, threshold).frequency).toBe("annual");
  });

  it("revenue between the two thresholds is quarterly", () => {
    expect(determineGstHstFilingFrequency(1500000.01, threshold).frequency).toBe("quarterly");
    expect(determineGstHstFilingFrequency(6000000, threshold).frequency).toBe("quarterly");
  });

  it("revenue above the quarterly threshold is monthly", () => {
    expect(determineGstHstFilingFrequency(6000000.01, threshold).frequency).toBe("monthly");
    expect(determineGstHstFilingFrequency(50000000, threshold).frequency).toBe("monthly");
  });

  it("cites the threshold rule", () => {
    expect(determineGstHstFilingFrequency(1000000, threshold).ruleRefs).toEqual(["rule-freq"]);
  });
});
