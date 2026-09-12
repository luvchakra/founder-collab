/**
 * COMPLY-P0-04.6 (GST Invoice Validation): "Validate mandatory transaction/invoice fields
 * before downstream submission." A checklist of software-rule checks against a document
 * already read via COMPLY-P0-03.1's `DocumentContext` -- NEVER a claim that a document
 * passing every check here is legally "GST compliant" (backlog rule 11): this validates
 * that the fields a GST tax invoice needs are present and internally consistent, which is
 * necessary but not sufficient for compliance (e.g. it says nothing about whether the
 * amounts themselves were computed under the correct, currently-effective rate).
 */

export type GstInvoiceIssueCode =
  | "missing_invoice_number"
  | "missing_invoice_date"
  | "no_lines"
  | "line_hsn_sac_missing"
  | "line_hsn_sac_invalid"
  | "place_of_supply_unknown"
  | "tax_split_mismatch"
  | "line_tax_rate_not_a_known_slab";

export type GstInvoiceIssueSeverity = "error" | "warning";

export type GstInvoiceIssue = {
  code: GstInvoiceIssueCode;
  severity: GstInvoiceIssueSeverity;
  message: string;
  /** Present for a line-level issue; absent for a document-level one. */
  lineId?: string;
};

/** `valid` is true only when there are no "error"-severity issues -- a "warning" (e.g. a
 * tax-split/place-of-supply mismatch worth a human's attention) does not block downstream
 * submission on its own, but is still surfaced rather than silently dropped. */
export type GstInvoiceValidationResult = {
  valid: boolean;
  issues: GstInvoiceIssue[];
};
