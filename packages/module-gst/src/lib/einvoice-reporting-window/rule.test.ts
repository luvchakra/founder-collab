import { describe, expect, it } from "vitest";
import { parseEinvoiceReportingWindowValue } from "./rule";

describe("parseEinvoiceReportingWindowValue", () => {
  it("parses a well-formed value", () => {
    expect(parseEinvoiceReportingWindowValue({ aatoThresholdInr: 100000000, windowDays: 30, label: "30-day window" })).toEqual({
      aatoThresholdInr: 100000000,
      windowDays: 30,
      label: "30-day window",
    });
  });

  it("defaults the label when missing or blank", () => {
    expect(parseEinvoiceReportingWindowValue({ aatoThresholdInr: 100000000, windowDays: 30 })).toEqual({
      aatoThresholdInr: 100000000,
      windowDays: 30,
      label: "e-Invoice reporting window",
    });
  });

  it("returns null when aatoThresholdInr is missing or invalid", () => {
    expect(parseEinvoiceReportingWindowValue({ windowDays: 30 })).toBeNull();
    expect(parseEinvoiceReportingWindowValue({ aatoThresholdInr: 0, windowDays: 30 })).toBeNull();
    expect(parseEinvoiceReportingWindowValue({ aatoThresholdInr: "100000000", windowDays: 30 })).toBeNull();
  });

  it("returns null when windowDays is missing or invalid", () => {
    expect(parseEinvoiceReportingWindowValue({ aatoThresholdInr: 100000000 })).toBeNull();
    expect(parseEinvoiceReportingWindowValue({ aatoThresholdInr: 100000000, windowDays: 0 })).toBeNull();
    expect(parseEinvoiceReportingWindowValue({ aatoThresholdInr: 100000000, windowDays: -5 })).toBeNull();
  });
});
