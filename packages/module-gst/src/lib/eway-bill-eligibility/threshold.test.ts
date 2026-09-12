import { describe, expect, it } from "vitest";
import { parseEwayBillThresholdValue } from "./threshold";

describe("parseEwayBillThresholdValue", () => {
  it("parses a well-formed value", () => {
    const parsed = parseEwayBillThresholdValue({ thresholdInr: 50000, label: "E-Way Bill required above ₹50,000 consignment value" });
    expect(parsed).toEqual({ thresholdInr: 50000, label: "E-Way Bill required above ₹50,000 consignment value" });
  });

  it("falls back to a default label when none is provided", () => {
    const parsed = parseEwayBillThresholdValue({ thresholdInr: 50000 });
    expect(parsed?.label).toBe("E-Way Bill consignment value threshold");
  });

  it("returns null for a missing thresholdInr", () => {
    expect(parseEwayBillThresholdValue({ label: "x" })).toBeNull();
  });

  it("returns null for a non-numeric thresholdInr", () => {
    expect(parseEwayBillThresholdValue({ thresholdInr: "50000" })).toBeNull();
  });

  it("returns null for a zero or negative thresholdInr", () => {
    expect(parseEwayBillThresholdValue({ thresholdInr: 0 })).toBeNull();
    expect(parseEwayBillThresholdValue({ thresholdInr: -50000 })).toBeNull();
  });

  it("returns null for a non-finite thresholdInr", () => {
    expect(parseEwayBillThresholdValue({ thresholdInr: Number.POSITIVE_INFINITY })).toBeNull();
  });
});
