import { describe, expect, it } from "vitest";
import { parseGstr1B2cLargeThresholdValue } from "./threshold";

describe("parseGstr1B2cLargeThresholdValue", () => {
  it("parses a well-formed value", () => {
    const parsed = parseGstr1B2cLargeThresholdValue({
      thresholdInr: 100000,
      label: "GSTR-1 B2C Large threshold",
    });
    expect(parsed).toEqual({ thresholdInr: 100000, label: "GSTR-1 B2C Large threshold" });
  });

  it("falls back to a default label when none is provided", () => {
    const parsed = parseGstr1B2cLargeThresholdValue({ thresholdInr: 100000 });
    expect(parsed?.label).toBe("GSTR-1 B2C Large invoice-wise reporting threshold");
  });

  it("returns null for a missing thresholdInr", () => {
    expect(parseGstr1B2cLargeThresholdValue({ label: "x" })).toBeNull();
  });

  it("returns null for a non-numeric thresholdInr", () => {
    expect(parseGstr1B2cLargeThresholdValue({ thresholdInr: "100000" })).toBeNull();
  });

  it("returns null for a zero or negative thresholdInr", () => {
    expect(parseGstr1B2cLargeThresholdValue({ thresholdInr: 0 })).toBeNull();
    expect(parseGstr1B2cLargeThresholdValue({ thresholdInr: -100000 })).toBeNull();
  });

  it("returns null for a non-finite thresholdInr", () => {
    expect(parseGstr1B2cLargeThresholdValue({ thresholdInr: Number.POSITIVE_INFINITY })).toBeNull();
  });
});
