import { describe, expect, it } from "vitest";
import { efileThresholdRule, form1099ThresholdRule, parseEfileThresholdValue, parseForm1099ThresholdValue } from "./rules";

describe("form1099ThresholdRule / efileThresholdRule", () => {
  it("builds the national (jurisdiction: null) lineage keys", () => {
    expect(form1099ThresholdRule()).toEqual({
      country: "US",
      jurisdiction: null,
      regime: "INFORMATION_RETURNS",
      ruleKey: "form_1099_reporting_threshold_usd",
    });
    expect(efileThresholdRule()).toEqual({
      country: "US",
      jurisdiction: null,
      regime: "INFORMATION_RETURNS",
      ruleKey: "information_return_efile_threshold_count",
    });
  });
});

describe("parseForm1099ThresholdValue", () => {
  it("parses a well-formed value", () => {
    expect(parseForm1099ThresholdValue({ thresholdUsd: 2000, label: "OBBBA threshold" })).toEqual({ thresholdUsd: 2000, label: "OBBBA threshold" });
  });

  it("defaults a missing/blank label", () => {
    expect(parseForm1099ThresholdValue({ thresholdUsd: 600 })?.label).toBe("Form 1099-NEC/MISC reporting threshold");
  });

  it("rejects a non-numeric thresholdUsd", () => {
    expect(parseForm1099ThresholdValue({ thresholdUsd: "600" })).toBeNull();
  });

  it("rejects a missing thresholdUsd entirely", () => {
    expect(parseForm1099ThresholdValue({ label: "x" })).toBeNull();
  });
});

describe("parseEfileThresholdValue", () => {
  it("parses a well-formed value", () => {
    expect(parseEfileThresholdValue({ thresholdCount: 10, label: "TD 9972" })).toEqual({ thresholdCount: 10, label: "TD 9972" });
  });

  it("rejects a non-numeric thresholdCount", () => {
    expect(parseEfileThresholdValue({ thresholdCount: "ten" })).toBeNull();
  });
});
