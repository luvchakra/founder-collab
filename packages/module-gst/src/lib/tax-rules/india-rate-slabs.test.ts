import { describe, expect, it } from "vitest";
import { isKnownGstRateSlab, parseRateSlabValue } from "./india-rate-slabs";

describe("parseRateSlabValue", () => {
  it("parses a well-formed value", () => {
    expect(parseRateSlabValue({ slabsPercent: [0, 5, 18, 40], label: "GST 2.0" })).toEqual({
      slabsPercent: [0, 5, 18, 40],
      label: "GST 2.0",
    });
  });

  it("defaults the label when missing or blank", () => {
    expect(parseRateSlabValue({ slabsPercent: [0, 5] })).toEqual({ slabsPercent: [0, 5], label: "GST rate slabs" });
    expect(parseRateSlabValue({ slabsPercent: [0, 5], label: "  " })).toEqual({
      slabsPercent: [0, 5],
      label: "GST rate slabs",
    });
  });

  it("returns null when slabsPercent is missing", () => {
    expect(parseRateSlabValue({ label: "GST" })).toBeNull();
  });

  it("returns null when slabsPercent isn't an array", () => {
    expect(parseRateSlabValue({ slabsPercent: 18 })).toBeNull();
  });

  it("returns null when slabsPercent is an empty array", () => {
    expect(parseRateSlabValue({ slabsPercent: [] })).toBeNull();
  });

  it("returns null when any entry isn't a finite number", () => {
    expect(parseRateSlabValue({ slabsPercent: [0, "5", 18] })).toBeNull();
    expect(parseRateSlabValue({ slabsPercent: [0, Number.NaN, 18] })).toBeNull();
  });
});

describe("isKnownGstRateSlab", () => {
  const slabs = [0, 5, 18, 40];

  it("matches an exact slab", () => {
    expect(isKnownGstRateSlab(18, slabs)).toBe(true);
    expect(isKnownGstRateSlab(0, slabs)).toBe(true);
  });

  it("matches a slab regardless of decimal representation (numeric(5,2) round-trip)", () => {
    expect(isKnownGstRateSlab(18.0, slabs)).toBe(true);
    expect(isKnownGstRateSlab(5.0, [5.0])).toBe(true);
  });

  it("does not match a rate that isn't one of the given slabs", () => {
    expect(isKnownGstRateSlab(12, slabs)).toBe(false);
    expect(isKnownGstRateSlab(28, slabs)).toBe(false);
  });

  it("never matches anything against an empty slab list", () => {
    expect(isKnownGstRateSlab(0, [])).toBe(false);
  });
});
