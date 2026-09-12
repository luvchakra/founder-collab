import { describe, expect, it } from "vitest";
import { determineEuVatTreatment } from "./determine";

const OSS_THRESHOLD = 10000;

describe("determineEuVatTreatment", () => {
  it("returns unknown/incomplete when the seller is not an EU member state", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "IN",
      buyerCountry: "DE",
      buyerVatIdValidated: false,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(result.incomplete).toBe(true);
    expect(result.placeOfSupply).toBe("unknown");
    expect(result.treatment).toBeNull();
  });

  it("treats a same-country sale as domestic, standard-rated at the seller's own country", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "DE",
      buyerVatIdValidated: false,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(result).toMatchObject({ treatment: "standard", placeOfSupply: "domestic", rateCountry: "DE", incomplete: false });
  });

  it("treats a sale to a non-EU buyer as an export, zero-rated on the invoice", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "US",
      buyerVatIdValidated: false,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(result).toMatchObject({ treatment: "export", placeOfSupply: "export", rateCountry: null, incomplete: false });
  });

  it("treats an intra-EU B2B sale with a validated VAT ID as reverse charge, no rate country", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "FR",
      buyerVatIdValidated: true,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(result).toMatchObject({ treatment: "reverse_charge", placeOfSupply: "intra_eu_b2b", rateCountry: null, incomplete: false });
  });

  it("returns incomplete for an intra-EU B2C sale with no declared cumulative distance-sales figure", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "FR",
      buyerVatIdValidated: false,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(result.incomplete).toBe(true);
    expect(result.placeOfSupply).toBe("unknown");
  });

  it("origin-rates an intra-EU B2C sale at or below the OSS threshold", () => {
    const atThreshold = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "FR",
      buyerVatIdValidated: false,
      cumulativeEuDistanceSalesEur: 10000,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(atThreshold).toMatchObject({ treatment: "standard", placeOfSupply: "intra_eu_b2c_origin", rateCountry: "DE", incomplete: false });

    const belowThreshold = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "FR",
      buyerVatIdValidated: false,
      cumulativeEuDistanceSalesEur: 500,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(belowThreshold.placeOfSupply).toBe("intra_eu_b2c_origin");
  });

  it("destination-rates an intra-EU B2C sale once the OSS threshold is exceeded", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "FR",
      buyerVatIdValidated: false,
      cumulativeEuDistanceSalesEur: 10000.01,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(result).toMatchObject({ treatment: "standard", placeOfSupply: "intra_eu_b2c_destination", rateCountry: "FR", incomplete: false });
  });

  it("returns incomplete for a B2C sale when the OSS threshold itself could not be resolved, even with a declared cumulative figure", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "FR",
      buyerVatIdValidated: false,
      cumulativeEuDistanceSalesEur: 500,
      ossThresholdEur: null,
    });
    expect(result.incomplete).toBe(true);
    expect(result.placeOfSupply).toBe("unknown");
  });

  it("never reports incomplete for a domestic/export/B2B sale just because ossThresholdEur is null (it wasn't needed)", () => {
    expect(
      determineEuVatTreatment({ sellerCountry: "DE", buyerCountry: "DE", buyerVatIdValidated: false, ossThresholdEur: null }).incomplete,
    ).toBe(false);
    expect(
      determineEuVatTreatment({ sellerCountry: "DE", buyerCountry: "US", buyerVatIdValidated: false, ossThresholdEur: null }).incomplete,
    ).toBe(false);
    expect(
      determineEuVatTreatment({ sellerCountry: "DE", buyerCountry: "FR", buyerVatIdValidated: true, ossThresholdEur: null }).incomplete,
    ).toBe(false);
  });

  it("treats a buyer with an UNVALIDATED VAT id the same as B2C, never a silent B2B assumption", () => {
    const result = determineEuVatTreatment({
      sellerCountry: "DE",
      buyerCountry: "FR",
      buyerVatIdValidated: false,
      cumulativeEuDistanceSalesEur: 0,
      ossThresholdEur: OSS_THRESHOLD,
    });
    expect(result.placeOfSupply).not.toBe("intra_eu_b2b");
  });
});
