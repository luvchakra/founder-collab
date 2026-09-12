import { describe, expect, it } from "vitest";
import { classifyGstr1Document } from "./classify";

const VALID_GSTIN = "27AAPFU0939F1ZV";

describe("classifyGstr1Document", () => {
  it("is excluded_export when place of supply is export, regardless of GSTIN", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: VALID_GSTIN,
        placeOfSupply: "export",
        invoiceValue: 500000,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("excluded_export");
  });

  it("is excluded_unknown_place_of_supply when place of supply couldn't be resolved", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: null,
        placeOfSupply: "unknown",
        invoiceValue: 500000,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("excluded_unknown_place_of_supply");
  });

  it("is b2b for an invoice to a valid, registered GSTIN regardless of value or state", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: VALID_GSTIN,
        placeOfSupply: "intra_state",
        invoiceValue: 100,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("b2b");
  });

  it("is cdnr for a credit note to a valid, registered GSTIN", () => {
    expect(
      classifyGstr1Document({
        docType: "credit_note",
        gstin: VALID_GSTIN,
        placeOfSupply: "inter_state",
        invoiceValue: 100,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("cdnr");
  });

  it("is cdnr for a debit note to a valid, registered GSTIN", () => {
    expect(
      classifyGstr1Document({
        docType: "debit_note",
        gstin: VALID_GSTIN,
        placeOfSupply: "inter_state",
        invoiceValue: 100,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("cdnr");
  });

  it("treats an invalid GSTIN string the same as unregistered (not b2b)", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: "not-a-real-gstin",
        placeOfSupply: "intra_state",
        invoiceValue: 100,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("b2c_others_net");
  });

  it("is b2c_large for an inter-state unregistered invoice exceeding the threshold", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: null,
        placeOfSupply: "inter_state",
        invoiceValue: 100001,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("b2c_large");
  });

  it("is NOT b2c_large when the value exactly equals the threshold (strict >, matching Rule 59(4)'s 'exceeding')", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: null,
        placeOfSupply: "inter_state",
        invoiceValue: 100000,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("b2c_others_net");
  });

  it("is cdnur for an inter-state unregistered credit note exceeding the threshold", () => {
    expect(
      classifyGstr1Document({
        docType: "credit_note",
        gstin: null,
        placeOfSupply: "inter_state",
        invoiceValue: 250000,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("cdnur");
  });

  it("is never b2c_large for an intra-state unregistered supply, no matter how large the value", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: null,
        placeOfSupply: "intra_state",
        invoiceValue: 10000000,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("b2c_others_net");
  });

  it("falls back to b2c_others_net for an unregistered inter-state supply when no threshold rule resolved (never guesses large)", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: null,
        placeOfSupply: "inter_state",
        invoiceValue: 10000000,
        b2cLargeThresholdInr: null,
      }),
    ).toBe("b2c_others_net");
  });

  it("is b2c_others_net for a small intra-state unregistered supply", () => {
    expect(
      classifyGstr1Document({
        docType: "invoice",
        gstin: null,
        placeOfSupply: "intra_state",
        invoiceValue: 500,
        b2cLargeThresholdInr: 100000,
      }),
    ).toBe("b2c_others_net");
  });
});
