/**
 * COMPLY-P0-07 (India Returns): the one normalized outward-supply document shape every
 * return preparer in this folder (GSTR-1 today; GSTR-3B as of COMPLY-P0-07.2) is built
 * from, so the underlying `core.documents`/`core.document_lines` read/place-of-supply
 * resolution logic is written and tested exactly once, not once per return type. See
 * `queries.ts`'s own docstring for where this comes from.
 */

export type OutwardDocType = "invoice" | "credit_note" | "debit_note";

export type OutwardSupplyLine = {
  hsnCode: string | null;
  quantity: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

export type OutwardSupplyDocument = {
  documentId: string;
  docType: OutwardDocType;
  number: string | null;
  docDate: string;
  partyId: string;
  partyName: string;
  /** The buyer's own GSTIN on file, or `null` when none is recorded. */
  gstin: string | null;
  /** `core.tax_identities.gst_registration_type` for this party, or `null` when no
   * `core.tax_identities` row exists at all (absence of data, not a claim the party is
   * unregistered -- same convention `PartyTaxIdentity` itself already establishes). GSTR-1
   * doesn't need this (it derives registered-vs-not from GSTIN validity alone); GSTR-3B's
   * own Table 3.2 does, to split inter-state unregistered-recipient supplies from
   * inter-state composition-dealer supplies. */
  gstRegistrationType: "regular" | "composition" | "unregistered" | null;
  placeOfSupply: "intra_state" | "inter_state" | "export" | "unknown";
  /** The buyer's resolved GST state code when `placeOfSupply` is `"intra_state"` or
   * `"inter_state"` -- `null` for `"export"`/`"unknown"`. */
  buyerStateCode: string | null;
  /** `core.documents.subtotal` -- the taxable value before tax. */
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** `core.documents.total_amount`. */
  invoiceValue: number;
  /** For a credit/debit note only: the original invoice's own document id, when
   * `core.documents.source_ref` recorded one -- `null` otherwise. */
  againstInvoiceId: string | null;
  lines: OutwardSupplyLine[];
};
