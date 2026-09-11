import { describe, expect, it } from "vitest";
import { determinePlaceOfSupply, isIndiaCountry } from "./determine";

describe("isIndiaCountry", () => {
  it("recognizes common spellings of India, case/whitespace-insensitively", () => {
    expect(isIndiaCountry("India")).toBe(true);
    expect(isIndiaCountry(" india ")).toBe(true);
    expect(isIndiaCountry("IN")).toBe(true);
    expect(isIndiaCountry("Bharat")).toBe(true);
  });

  it("returns false for a clearly non-India country", () => {
    expect(isIndiaCountry("United States")).toBe(false);
    expect(isIndiaCountry("Singapore")).toBe(false);
  });

  it("returns null (unknown) for empty/unset input, not false", () => {
    expect(isIndiaCountry(null)).toBeNull();
    expect(isIndiaCountry(undefined)).toBeNull();
    expect(isIndiaCountry("  ")).toBeNull();
  });
});

describe("determinePlaceOfSupply", () => {
  it("classifies matching state codes as intra_state", () => {
    expect(
      determinePlaceOfSupply({ sellerStateCode: "27", buyerStateCode: "27", buyerCountry: null }),
    ).toEqual({ treatment: "intra_state" });
  });

  it("classifies different state codes as inter_state", () => {
    expect(
      determinePlaceOfSupply({ sellerStateCode: "27", buyerStateCode: "29", buyerCountry: "India" }),
    ).toEqual({ treatment: "inter_state" });
  });

  it("classifies a clearly non-India buyer country as export, regardless of state codes", () => {
    expect(
      determinePlaceOfSupply({ sellerStateCode: "27", buyerStateCode: null, buyerCountry: "Singapore" }),
    ).toEqual({ treatment: "export" });
  });

  it("does not default to domestic or export when country is unset -- falls through to state comparison", () => {
    expect(
      determinePlaceOfSupply({ sellerStateCode: "27", buyerStateCode: "27", buyerCountry: null }),
    ).toEqual({ treatment: "intra_state" });
  });

  it("returns unknown with a reason when the seller's state can't be resolved", () => {
    const result = determinePlaceOfSupply({ sellerStateCode: null, buyerStateCode: "27", buyerCountry: null });
    expect(result.treatment).toBe("unknown");
    expect(result.reason).toMatch(/supplying business/);
  });

  it("returns unknown with a reason when the buyer's state can't be resolved", () => {
    const result = determinePlaceOfSupply({ sellerStateCode: "27", buyerStateCode: null, buyerCountry: null });
    expect(result.treatment).toBe("unknown");
    expect(result.reason).toMatch(/buyer's state/);
  });

  it("returns unknown when both states are unresolved, preferring the seller-state reason", () => {
    const result = determinePlaceOfSupply({ sellerStateCode: null, buyerStateCode: null, buyerCountry: null });
    expect(result.treatment).toBe("unknown");
    expect(result.reason).toMatch(/supplying business/);
  });
});
