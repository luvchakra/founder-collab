import { describe, expect, it } from "vitest";
import { determineGstLineTax } from "./determine";
import type { PlaceOfSupplyResult } from "../place-of-supply/types";

const intraState: PlaceOfSupplyResult = { treatment: "intra_state" };
const interState: PlaceOfSupplyResult = { treatment: "inter_state" };
const exportTreatment: PlaceOfSupplyResult = { treatment: "export" };
const unknown: PlaceOfSupplyResult = { treatment: "unknown", reason: "The buyer's state could not be resolved." };

describe("determineGstLineTax", () => {
  it("splits a standard-rated intra-state supply into CGST+SGST", () => {
    const result = determineGstLineTax({
      taxableValue: 1000,
      itemTaxRatePercent: 18,
      placeOfSupply: intraState,
      sellerStateCode: "27",
      buyerStateCode: "27",
      reverseCharge: false,
    });
    expect(result).toEqual({
      treatment: "standard",
      placeOfSupply: "intra_state",
      cgstRate: 9,
      sgstRate: 9,
      igstRate: 0,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      totalTax: 180,
      incomplete: false,
    });
  });

  it("charges a standard-rated inter-state supply as IGST only", () => {
    const result = determineGstLineTax({
      taxableValue: 1000,
      itemTaxRatePercent: 18,
      placeOfSupply: interState,
      sellerStateCode: "27",
      buyerStateCode: "29",
      reverseCharge: false,
    });
    expect(result).toEqual({
      treatment: "standard",
      placeOfSupply: "inter_state",
      cgstRate: 0,
      sgstRate: 0,
      igstRate: 18,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 180,
      totalTax: 180,
      incomplete: false,
    });
  });

  it("zero-rates an export regardless of the item's own tax rate", () => {
    const result = determineGstLineTax({
      taxableValue: 1000,
      itemTaxRatePercent: 18,
      placeOfSupply: exportTreatment,
      sellerStateCode: "27",
      buyerStateCode: null,
      reverseCharge: false,
    });
    expect(result.treatment).toBe("export");
    expect(result.totalTax).toBe(0);
    expect(result.incomplete).toBe(false);
  });

  it("charges no tax on the invoice when reverse charge applies", () => {
    const result = determineGstLineTax({
      taxableValue: 1000,
      itemTaxRatePercent: 18,
      placeOfSupply: intraState,
      sellerStateCode: "27",
      buyerStateCode: "27",
      reverseCharge: true,
    });
    expect(result.treatment).toBe("reverse_charge");
    expect(result.totalTax).toBe(0);
  });

  it("reverse charge takes priority over a resolvable domestic split", () => {
    const result = determineGstLineTax({
      taxableValue: 500,
      itemTaxRatePercent: 5,
      placeOfSupply: interState,
      sellerStateCode: "27",
      buyerStateCode: "29",
      reverseCharge: true,
    });
    expect(result.treatment).toBe("reverse_charge");
    expect(result.placeOfSupply).toBe("inter_state");
  });

  it("treats a 0% item rate as zero_rated, not standard", () => {
    const result = determineGstLineTax({
      taxableValue: 1000,
      itemTaxRatePercent: 0,
      placeOfSupply: intraState,
      sellerStateCode: "27",
      buyerStateCode: "27",
      reverseCharge: false,
    });
    expect(result.treatment).toBe("zero_rated");
    expect(result.totalTax).toBe(0);
  });

  it("never guesses a treatment when place of supply is unknown", () => {
    const result = determineGstLineTax({
      taxableValue: 1000,
      itemTaxRatePercent: 18,
      placeOfSupply: unknown,
      sellerStateCode: "27",
      buyerStateCode: null,
      reverseCharge: false,
    });
    expect(result.treatment).toBeNull();
    expect(result.incomplete).toBe(true);
    expect(result.reason).toBe("The buyer's state could not be resolved.");
    expect(result.totalTax).toBe(0);
  });

  it("export wins over an unresolved buyer state (place of supply already decided export)", () => {
    const result = determineGstLineTax({
      taxableValue: 1000,
      itemTaxRatePercent: 18,
      placeOfSupply: exportTreatment,
      sellerStateCode: "27",
      buyerStateCode: null,
      reverseCharge: true,
    });
    // Export is decided before reverse charge is even checked -- an exported supply is
    // never also a reverse-charge one in this function's own precedence.
    expect(result.treatment).toBe("export");
  });
});
