/**
 * COMPLY-P0-07.4 (Return Drill-Down): "every return amount is traceable to source
 * transactions." Every row this epic's own preparers produce (GSTR-1's B2B/B2C
 * Large/B2C Others/CDNR-CDNUR/HSN rows, GSTR-3B's outward buckets and provisional ITC
 * total, GSTR-9's Table 4 buckets and provisional ITC-availed/HSN totals) already carries
 * its own `documentId`/`documentIds` -- COMPLY-P0-07.1/07.2/07.3 deliberately surfaced
 * these so this story could build drill-down ON TOP of them rather than re-deriving which
 * documents fed which row. This module is that drill-down: given a row's own id(s), fetch
 * the REAL `core.documents` rows behind it (`queries.ts`) and, where the row's own
 * reported amount is a whole-document sum or net, prove that summing those real
 * documents' own amounts -- combined the SAME way the return's own aggregation logic
 * combines them (credit-note-subtracts, everything else adds) -- reproduces exactly what
 * the return reported (`reconcile.ts`). Not a new persisted entity, no schema change --
 * same "lib first" shape COMPLY-P0-07.1/07.2/07.3 already established.
 */

/** One real source document behind a return row, as read directly from `core.documents`
 * -- not a re-derivation, the actual transaction record a reviewer or auditor could open. */
export type ReturnSourceDocument = {
  documentId: string;
  docType: "invoice" | "credit_note" | "debit_note" | "purchase_order";
  /** The document's own invoice/note/PO number, or `null` when none was recorded. */
  number: string | null;
  docDate: string;
  partyName: string;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  invoiceValue: number;
};

export type ReturnDrillDown = {
  /** The row's own document id(s), deduplicated -- the input this drill-down was asked
   * to resolve. */
  requestedDocumentIds: string[];
  /** The real documents found for this business, one per id that actually exists and
   * belongs to it. */
  documents: ReturnSourceDocument[];
  /** A requested id that could not be resolved to a real document owned by this business
   * -- never silently dropped (backlog rule 11/12: a return row whose own source document
   * has gone missing, or was requested for the wrong business, is a genuine data-integrity
   * signal a reviewer needs to see, not a quietly-shorter list). Empty in the ordinary
   * case where every id resolves. */
  missingDocumentIds: string[];
};
