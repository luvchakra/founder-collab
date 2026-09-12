import { describe, expect, it } from "vitest";
import {
  parseSgGstProspectiveGracePeriodValue,
  parseSgGstRegistrationThresholdValue,
  parseSgGstStandardRateValue,
  sgGstProspectiveGracePeriodRule,
  sgGstRegistrationThresholdRule,
  sgGstStandardRateRule,
} from "./rules";

describe("singapore-gst rules", () => {
  it("every lineage is SG/GST with no jurisdiction", () => {
    expect(sgGstStandardRateRule()).toEqual({ country: "SG", jurisdiction: null, regime: "GST", ruleKey: "gst_standard_rate_percent" });
    expect(sgGstRegistrationThresholdRule()).toEqual({
      country: "SG",
      jurisdiction: null,
      regime: "GST",
      ruleKey: "gst_registration_threshold_sgd",
    });
    expect(sgGstProspectiveGracePeriodRule()).toEqual({
      country: "SG",
      jurisdiction: null,
      regime: "GST",
      ruleKey: "gst_prospective_registration_grace_period_months",
    });
  });

  describe("parseSgGstStandardRateValue", () => {
    it("parses a valid rate", () => {
      expect(parseSgGstStandardRateValue({ ratePercent: 9, label: "GST 9%" })).toEqual({ ratePercent: 9, label: "GST 9%" });
    });
    it("defaults a missing label", () => {
      expect(parseSgGstStandardRateValue({ ratePercent: 9 })).toEqual({ ratePercent: 9, label: "GST standard rate" });
    });
    it("rejects a missing/non-numeric rate", () => {
      expect(parseSgGstStandardRateValue({})).toBeNull();
      expect(parseSgGstStandardRateValue({ ratePercent: "9" })).toBeNull();
    });
  });

  describe("parseSgGstRegistrationThresholdValue", () => {
    it("parses a valid threshold", () => {
      expect(parseSgGstRegistrationThresholdValue({ thresholdSgd: 1_000_000 })).toEqual({
        thresholdSgd: 1_000_000,
        label: "GST registration threshold",
      });
    });
    it("rejects a missing/non-numeric threshold", () => {
      expect(parseSgGstRegistrationThresholdValue({})).toBeNull();
      expect(parseSgGstRegistrationThresholdValue({ thresholdSgd: "1000000" })).toBeNull();
    });
  });

  describe("parseSgGstProspectiveGracePeriodValue", () => {
    it("parses a valid grace period", () => {
      expect(parseSgGstProspectiveGracePeriodValue({ months: 2 })).toEqual({
        months: 2,
        label: "Prospective registration GST-charging grace period",
      });
    });
    it("rejects a missing/zero/negative months value", () => {
      expect(parseSgGstProspectiveGracePeriodValue({})).toBeNull();
      expect(parseSgGstProspectiveGracePeriodValue({ months: 0 })).toBeNull();
      expect(parseSgGstProspectiveGracePeriodValue({ months: -1 })).toBeNull();
    });
  });
});
