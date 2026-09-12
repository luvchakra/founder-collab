import { describe, expect, it } from "vitest";
import { computeEwayBillValidityDays, parseEwayBillValidityValue } from "./validity";
import type { TaxRule } from "../tax-rules/types";

function makeRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: "rule-1",
    country: "IN",
    jurisdiction: null,
    regime: "GST",
    rule_key: "eway_bill_validity_km_per_day",
    value: { normalKmPerDay: 200, odcKmPerDay: 20 },
    version: 2,
    effective_from: "2021-01-01",
    effective_to: null,
    source: "test",
    treatment: null,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

const RULE_V2 = { normalKmPerDay: 200, odcKmPerDay: 20, label: "v2", rule: makeRule() };
const RULE_V1 = {
  normalKmPerDay: 100,
  odcKmPerDay: 20,
  label: "v1",
  rule: makeRule({ id: "rule-0", version: 1, effective_from: "2018-04-01", effective_to: "2021-01-01" }),
};

describe("parseEwayBillValidityValue", () => {
  it("parses a well-formed value", () => {
    expect(parseEwayBillValidityValue({ normalKmPerDay: 200, odcKmPerDay: 20, label: "x" })).toEqual({
      normalKmPerDay: 200,
      odcKmPerDay: 20,
      label: "x",
    });
  });

  it("falls back to a default label when none is provided", () => {
    expect(parseEwayBillValidityValue({ normalKmPerDay: 200, odcKmPerDay: 20 })?.label).toBe("E-Way Bill validity distance rule");
  });

  it("returns null when either figure is missing, non-numeric, zero, or negative", () => {
    expect(parseEwayBillValidityValue({ odcKmPerDay: 20 })).toBeNull();
    expect(parseEwayBillValidityValue({ normalKmPerDay: 200 })).toBeNull();
    expect(parseEwayBillValidityValue({ normalKmPerDay: "200", odcKmPerDay: 20 })).toBeNull();
    expect(parseEwayBillValidityValue({ normalKmPerDay: 0, odcKmPerDay: 20 })).toBeNull();
    expect(parseEwayBillValidityValue({ normalKmPerDay: 200, odcKmPerDay: -20 })).toBeNull();
  });
});

describe("computeEwayBillValidityDays", () => {
  it("returns null (not a guessed number) when no rule could be resolved", () => {
    const result = computeEwayBillValidityDays({ distanceKm: 300, vehicleType: "regular", rule: null });
    expect(result.validityDays).toBeNull();
    expect(result.reason).toContain("rule");
  });

  it("returns null (not a guessed number) when no distance is available", () => {
    const result = computeEwayBillValidityDays({ distanceKm: null, vehicleType: "regular", rule: RULE_V2 });
    expect(result.validityDays).toBeNull();
    expect(result.reason).toContain("distance");
  });

  it("computes exactly 1 day for a distance within one day's band (regular, v2: 200 km/day)", () => {
    expect(computeEwayBillValidityDays({ distanceKm: 150, vehicleType: "regular", rule: RULE_V2 }).validityDays).toBe(1);
    expect(computeEwayBillValidityDays({ distanceKm: 200, vehicleType: "regular", rule: RULE_V2 }).validityDays).toBe(1);
  });

  it("rounds up (part thereof) for a distance just over a day's band", () => {
    expect(computeEwayBillValidityDays({ distanceKm: 201, vehicleType: "regular", rule: RULE_V2 }).validityDays).toBe(2);
    expect(computeEwayBillValidityDays({ distanceKm: 400, vehicleType: "regular", rule: RULE_V2 }).validityDays).toBe(2);
    expect(computeEwayBillValidityDays({ distanceKm: 401, vehicleType: "regular", rule: RULE_V2 }).validityDays).toBe(3);
  });

  it("uses the ODC figure (20 km/day), not the regular figure, for Over Dimensional Cargo", () => {
    const result = computeEwayBillValidityDays({ distanceKm: 45, vehicleType: "over_dimensional_cargo", rule: RULE_V2 });
    expect(result.kmPerDay).toBe(20);
    expect(result.validityDays).toBe(3); // ceil(45 / 20)
  });

  it("treats zero distance as 1 day, never 0", () => {
    expect(computeEwayBillValidityDays({ distanceKm: 0, vehicleType: "regular", rule: RULE_V2 }).validityDays).toBe(1);
  });

  it("uses the pre-2021 100 km/day figure for the v1 rule (effective-date edge case)", () => {
    // Same 150 km distance, different rule VERSION in effect -- 2 days under v1 (100
    // km/day) vs. 1 day under v2 (200 km/day) above, proving the caller's own effective-
    // date resolution (not this pure function) is what picks the right version.
    expect(computeEwayBillValidityDays({ distanceKm: 150, vehicleType: "regular", rule: RULE_V1 }).validityDays).toBe(2);
  });

  it("the ODC figure is unchanged between v1 and v2", () => {
    const v1 = computeEwayBillValidityDays({ distanceKm: 45, vehicleType: "over_dimensional_cargo", rule: RULE_V1 });
    const v2 = computeEwayBillValidityDays({ distanceKm: 45, vehicleType: "over_dimensional_cargo", rule: RULE_V2 });
    expect(v1.validityDays).toBe(v2.validityDays);
    expect(v1.kmPerDay).toBe(20);
  });

  it("surfaces the underlying rule row for traceability", () => {
    const result = computeEwayBillValidityDays({ distanceKm: 150, vehicleType: "regular", rule: RULE_V2 });
    expect(result.rule).toBe(RULE_V2.rule);
  });
});
