import type { GstInvoiceValidationResult } from "../gst-invoice-validation/types";

/**
 * COMPLY-P0-05.2 (Schema Validation): "Validate mandatory fields." The IRP (e-invoice)
 * schema requires fields a plain domestic GST tax invoice does not always need -- most
 * importantly the SELLER's and BUYER's own GSTINs (e-invoicing under current GST rules
 * applies to B2B/export/SEZ/deemed-export supplies, never to an unregistered B2C
 * recipient) -- on top of every field COMPLY-P0-04.6's own `GstInvoiceValidationResult`
 * already checks (invoice number/date, line HSN/SAC, place of supply). This story adds
 * only the DELTA, never re-checking what 04.6 already covers (this platform's own "don't
 * duplicate deterministic logic" principle).
 */
export type EinvoiceSchemaIssueCode = "missing_seller_gstin" | "missing_buyer_gstin";

export type EinvoiceSchemaIssue = {
  code: EinvoiceSchemaIssueCode;
  severity: "error";
  message: string;
};

/** `valid` is true only when BOTH the underlying generic invoice validation (04.6) and
 * this story's own e-invoice-specific schema checks have no errors -- a document with a
 * clean `invoiceValidation` but a missing buyer GSTIN is still not e-invoice-schema-valid,
 * and vice versa. Never a claim that a document passing every check here will actually be
 * ACCEPTED by the IRP (backlog rule 11) -- only that the fields this module knows the real
 * schema requires are present and internally consistent. */
export type EinvoiceSchemaValidationResult = {
  valid: boolean;
  invoiceValidation: GstInvoiceValidationResult;
  schemaIssues: EinvoiceSchemaIssue[];
};
