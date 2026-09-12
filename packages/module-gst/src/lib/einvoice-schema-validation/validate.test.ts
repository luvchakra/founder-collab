import { describe, expect, it } from "vitest";
import { validateEinvoiceSchemaFields } from "./validate";
import type { GstInvoiceValidationResult } from "../gst-invoice-validation/types";

const VALID_INVOICE: GstInvoiceValidationResult = { valid: true, issues: [] };
const INVALID_INVOICE: GstInvoiceValidationResult = {
  valid: false,
  issues: [{ code: "missing_invoice_number", severity: "error", message: "no number" }],
};

describe("validateEinvoiceSchemaFields", () => {
  it("passes when the underlying invoice is valid and both GSTINs are present", () => {
    const result = validateEinvoiceSchemaFields({
      invoiceValidation: VALID_INVOICE,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: "29BBBBB1111B2Z6",
      buyerGstinKnown: true,
      placeOfSupply: "inter_state",
    });
    expect(result).toEqual({ valid: true, invoiceValidation: VALID_INVOICE, schemaIssues: [] });
  });

  it("flags a missing seller GSTIN as an error", () => {
    const result = validateEinvoiceSchemaFields({
      invoiceValidation: VALID_INVOICE,
      sellerGstin: null,
      buyerGstin: "29BBBBB1111B2Z6",
      buyerGstinKnown: true,
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(false);
    expect(result.schemaIssues).toContainEqual(expect.objectContaining({ code: "missing_seller_gstin" }));
  });

  it("flags a missing buyer GSTIN as an error for a domestic supply", () => {
    const result = validateEinvoiceSchemaFields({
      invoiceValidation: VALID_INVOICE,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: null,
      buyerGstinKnown: false,
      placeOfSupply: "intra_state",
    });
    expect(result.valid).toBe(false);
    expect(result.schemaIssues).toContainEqual(expect.objectContaining({ code: "missing_buyer_gstin" }));
  });

  it("gives a more specific message when the buyer is confirmed unregistered vs. simply unknown", () => {
    const unknown = validateEinvoiceSchemaFields({
      invoiceValidation: VALID_INVOICE,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: null,
      buyerGstinKnown: false,
      placeOfSupply: "intra_state",
    });
    const confirmed = validateEinvoiceSchemaFields({
      invoiceValidation: VALID_INVOICE,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: null,
      buyerGstinKnown: true,
      placeOfSupply: "intra_state",
    });
    expect(unknown.schemaIssues[0]?.message).toContain("No GSTIN is on file");
    expect(confirmed.schemaIssues[0]?.message).toContain("recorded as unregistered");
  });

  it("does not require a buyer GSTIN for an export supply", () => {
    const result = validateEinvoiceSchemaFields({
      invoiceValidation: VALID_INVOICE,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: null,
      buyerGstinKnown: false,
      placeOfSupply: "export",
    });
    expect(result.valid).toBe(true);
    expect(result.schemaIssues).toHaveLength(0);
  });

  it("is invalid overall when the underlying generic invoice validation already failed, even with both GSTINs present", () => {
    const result = validateEinvoiceSchemaFields({
      invoiceValidation: INVALID_INVOICE,
      sellerGstin: "27AAAAA0000A1Z5",
      buyerGstin: "29BBBBB1111B2Z6",
      buyerGstinKnown: true,
      placeOfSupply: "inter_state",
    });
    expect(result.valid).toBe(false);
    expect(result.schemaIssues).toHaveLength(0);
    expect(result.invoiceValidation).toBe(INVALID_INVOICE);
  });
});
