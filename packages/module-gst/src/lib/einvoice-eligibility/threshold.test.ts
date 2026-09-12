import { describe, expect, it } from "vitest";
import { parseEinvoiceThresholdValue } from "./threshold";

describe("parseEinvoiceThresholdValue", () => {
  it("parses a well-formed value", () => {
    expect(parseEinvoiceThresholdValue({ thresholdInr: 50000000, label: "₹5 crore" })).toEqual({
      thresholdInr: 50000000,
      label: "₹5 crore",
    });
  });

  it("defaults the label when missing or blank", () => {
    expect(parseEinvoiceThresholdValue({ thresholdInr: 50000000 })).toEqual({
      thresholdInr: 50000000,
      label: "e-Invoice turnover threshold",
    });
    expect(parseEinvoiceThresholdValue({ thresholdInr: 50000000, label: "   " })).toEqual({
      thresholdInr: 50000000,
      label: "e-Invoice turnover threshold",
    });
  });

  it("returns null when thresholdInr is missing", () => {
    expect(parseEinvoiceThresholdValue({ label: "₹5 crore" })).toBeNull();
  });

  it("returns null when thresholdInr isn't a number", () => {
    expect(parseEinvoiceThresholdValue({ thresholdInr: "50000000" })).toBeNull();
  });

  it("returns null when thresholdInr is zero or negative", () => {
    expect(parseEinvoiceThresholdValue({ thresholdInr: 0 })).toBeNull();
    expect(parseEinvoiceThresholdValue({ thresholdInr: -1 })).toBeNull();
  });

  it("returns null when thresholdInr is not finite", () => {
    expect(parseEinvoiceThresholdValue({ thresholdInr: Number.NaN })).toBeNull();
    expect(parseEinvoiceThresholdValue({ thresholdInr: Number.POSITIVE_INFINITY })).toBeNull();
  });
});
