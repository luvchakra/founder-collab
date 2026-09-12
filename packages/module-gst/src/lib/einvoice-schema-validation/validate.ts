import type { GstInvoiceValidationResult } from "../gst-invoice-validation/types";
import type { PlaceOfSupplyTreatment } from "../place-of-supply/types";
import type { EinvoiceSchemaIssue, EinvoiceSchemaValidationResult } from "./types";

/**
 * COMPLY-P0-05.2 (Schema Validation). Pure: every fact this needs (the already-computed
 * generic invoice validation result, the seller's own primary registration number, the
 * buyer's own GSTIN and its "is there a row at all" state, and place of supply) is
 * resolved by the caller (`queries.ts`'s own orchestrator) and passed in, matching this
 * module's established "pure core function, thin orchestrator" convention.
 *
 * `buyerGstin` is required for every treatment except `"export"` -- e-invoicing under
 * current GST rules applies to B2B, export, SEZ and deemed-export supplies, never to an
 * unregistered B2C recipient, so a domestic supply with no buyer GSTIN on file cannot be
 * e-invoiced as-is (backlog rule 11: this is a hard schema requirement, not a soft
 * preference). `buyerGstinKnown` distinguishes "no `core.tax_identities` row at all"
 * (unknown) from "a row exists and explicitly says `unregistered`" (confirmed) -- both
 * still fail this check, but with a different, more precise message, the same "unknown vs.
 * confirmed" distinction COMPLY-P0-03.4's own `getPartyTaxIdentity` docstring established.
 */
export function validateEinvoiceSchemaFields(input: {
  invoiceValidation: GstInvoiceValidationResult;
  sellerGstin: string | null;
  buyerGstin: string | null;
  buyerGstinKnown: boolean;
  placeOfSupply: PlaceOfSupplyTreatment;
}): EinvoiceSchemaValidationResult {
  const schemaIssues: EinvoiceSchemaIssue[] = [];

  if (!input.sellerGstin || !input.sellerGstin.trim()) {
    schemaIssues.push({
      code: "missing_seller_gstin",
      severity: "error",
      message: "This business has no primary India GST registration -- an e-invoice cannot be generated without a seller GSTIN.",
    });
  }

  if (input.placeOfSupply !== "export" && (!input.buyerGstin || !input.buyerGstin.trim())) {
    schemaIssues.push({
      code: "missing_buyer_gstin",
      severity: "error",
      message: input.buyerGstinKnown
        ? "The buyer is recorded as unregistered -- e-invoicing under current GST rules applies to B2B, export, SEZ and deemed-export supplies, not to an unregistered B2C recipient."
        : "No GSTIN is on file for the buyer -- e-invoicing requires a registered recipient (or an export/SEZ/deemed-export treatment) and cannot proceed without one.",
    });
  }

  return {
    valid: input.invoiceValidation.valid && schemaIssues.length === 0,
    invoiceValidation: input.invoiceValidation,
    schemaIssues,
  };
}
