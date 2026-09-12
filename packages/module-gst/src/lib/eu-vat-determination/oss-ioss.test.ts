import { describe, expect, it } from "vitest";
import { parseEuThresholdValue } from "./oss-ioss";

describe("parseEuThresholdValue", () => {
  it("parses a well-formed OSS threshold value", () => {
    expect(parseEuThresholdValue({ thresholdEur: 10000, appliesTo: "distance sales", label: "OSS threshold" })).toEqual({
      thresholdEur: 10000,
      appliesTo: "distance sales",
      label: "OSS threshold",
    });
  });

  it("defaults appliesTo/label when missing", () => {
    expect(parseEuThresholdValue({ thresholdEur: 150 })).toEqual({ thresholdEur: 150, appliesTo: "", label: "EU threshold" });
  });

  it("returns null when thresholdEur is missing or not a finite number", () => {
    expect(parseEuThresholdValue({ appliesTo: "x" })).toBeNull();
    expect(parseEuThresholdValue({ thresholdEur: "10000" })).toBeNull();
    expect(parseEuThresholdValue({ thresholdEur: Number.NaN })).toBeNull();
  });
});
