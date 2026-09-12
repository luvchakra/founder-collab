import { describe, expect, it } from "vitest";
import { determineSmallSupplierRegistrationObligation } from "./registration";
import type { ResolvedSmallSupplierThresholdRule } from "./types";

const threshold: ResolvedSmallSupplierThresholdRule = { thresholdCad: 30000, label: "small-supplier threshold", rule: { id: "rule-30k" } as never };

describe("determineSmallSupplierRegistrationObligation", () => {
  it("unresolved when no threshold rule is on file", () => {
    const result = determineSmallSupplierRegistrationObligation(50000, null);
    expect(result).toMatchObject({ resolved: false, obligated: null, thresholdCad: null, ruleRefs: [] });
  });

  it("revenue exactly AT the threshold is NOT obligated (a strict EXCEEDS test, not >=)", () => {
    const result = determineSmallSupplierRegistrationObligation(30000, threshold);
    expect(result).toMatchObject({ resolved: true, obligated: false });
  });

  it("revenue above the threshold is obligated", () => {
    const result = determineSmallSupplierRegistrationObligation(30000.01, threshold);
    expect(result).toMatchObject({ resolved: true, obligated: true, thresholdCad: 30000, ruleRefs: ["rule-30k"] });
  });

  it("revenue well below the threshold is not obligated", () => {
    expect(determineSmallSupplierRegistrationObligation(5000, threshold).obligated).toBe(false);
  });
});
