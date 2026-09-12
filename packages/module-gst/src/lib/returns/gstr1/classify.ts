import { isValidGstin } from "@cofounderai/core/lib/gst";
import type { Gstr1DocType, Gstr1SourceDocument } from "./types";

export type Gstr1Classification =
  | "b2b"
  | "cdnr"
  | "b2c_large"
  | "cdnur"
  | "b2c_others_net"
  | "excluded_export"
  | "excluded_unknown_place_of_supply";

/**
 * COMPLY-P0-07.1 (GSTR-1 Preparation): the one classification rule every GSTR-1 table
 * this module populates is built from. Pure and DB-independent -- `aggregate.ts` calls
 * this once per source document, `queries.ts` resolves the DB inputs it needs.
 *
 * Order of checks mirrors the real form's own precedence:
 * 1. An export has no domestic "state" to compare and Table 6 (exports) is explicitly not
 *    modeled (see `types.ts`'s own docstring) -- excluded outright, never miscoded as an
 *    inter-state domestic supply.
 * 2. An unresolved place of supply is a genuine data gap, not "assume domestic" (backlog
 *    rule 11) -- excluded, never silently defaulted to intra/inter-state.
 * 3. A recipient with a valid, registered GSTIN is always B2B (invoice) or CDNR (credit/
 *    debit note) -- regardless of value or intra-/inter-state, matching the real form
 *    (Table 4A has no value threshold at all).
 * 4. Otherwise the recipient is unregistered: only an INTER-STATE supply above the
 *    effective threshold is B2C Large (Table 5) or CDNUR (Table 9B); every other
 *    unregistered-recipient supply (any intra-state value, or inter-state at/below the
 *    threshold) nets into Table 7's own B2C Others state-wise summary. Strict `>`, matching
 *    Rule 59(4)'s own "exceeding"/"more than" wording (the same convention
 *    `determineEwayBillEligibility`'s own Rule 138(1) threshold check already uses for its
 *    own "exceeds" wording).
 */
export function classifyGstr1Document(input: {
  docType: Gstr1DocType;
  gstin: string | null;
  placeOfSupply: Gstr1SourceDocument["placeOfSupply"];
  invoiceValue: number;
  b2cLargeThresholdInr: number | null;
}): Gstr1Classification {
  if (input.placeOfSupply === "export") return "excluded_export";
  if (input.placeOfSupply === "unknown") return "excluded_unknown_place_of_supply";

  const hasValidRegisteredGstin = !!input.gstin && isValidGstin(input.gstin);
  if (hasValidRegisteredGstin) {
    return input.docType === "invoice" ? "b2b" : "cdnr";
  }

  const isLarge =
    input.placeOfSupply === "inter_state" &&
    input.b2cLargeThresholdInr !== null &&
    input.invoiceValue > input.b2cLargeThresholdInr;

  if (isLarge) {
    return input.docType === "invoice" ? "b2c_large" : "cdnur";
  }

  return "b2c_others_net";
}
