/**
 * COMPLY-P0-07.1 (GSTR-1 Preparation): the shape this module organizes a period's own
 * outward-supply documents into, matching the real GSTR-1 form's own table numbering
 * (GSTN's own tutorial/contextual-help pages, ClearTax's and Masters India's GSTR-1
 * table-wise guides -- see `queries.ts`'s own docstring for the full research trail) --
 * NOT a new persisted entity (see that file's own docstring for why this story is a pure,
 * on-demand computation over `core.documents`/`core.document_lines`, with no new table).
 *
 * Table coverage is deliberately partial -- every table this module does NOT populate is
 * named in `Gstr1Return.notModeled`, not silently absent, per backlog rule 11 ("never
 * claim compliant") and rule 12 (distinguish what was actually computed from what wasn't):
 *   - Table 4B/4C (reverse-charge / e-commerce-operator-collected B2B supplies) -- no
 *     reverse-charge or e-commerce-operator flag exists anywhere on `core.documents`.
 *   - Table 6A/6B/6C (exports / SEZ supplies with payment / deemed exports) -- exports are
 *     detected (`placeOfSupply === "export"`) but excluded rather than placed in a Table 6
 *     row, since Table 6's own zero-rated/LUT-vs-with-payment distinction needs data (an
 *     export type, a shipping bill/LUT reference) this platform doesn't capture yet; SEZ
 *     has no flag on any party at all (`lib/place-of-supply/determine.ts` already flags
 *     this same gap).
 *   - Table 8 (Nil-rated / exempted / non-GST outward supplies) -- no per-line tax
 *     TREATMENT (COMPLY-P0-02.4's own vocabulary) is recorded on `core.document_lines`
 *     today; only a flat `tax_rate`/`taxable` pair.
 *   - Table 9A / 10 (amendments to a PRIOR period's own B2B/B2CL/exports/B2C Others) --
 *     no document-amendment/revision history exists to detect "this invoice was actually
 *     entered in an earlier period's own return."
 *   - Table 11 (advances received/adjusted) -- no advance-receipt concept exists anywhere
 *     in `core`.
 *   - Table 13 (documents issued, incl. cancelled-document counts) -- `core.documents.
 *     status` deliberately has no fixed vocabulary across modules/doc_types (see
 *     `20260906105000_core_documents.sql`'s own comment), so a generic "was this document
 *     cancelled" check can't be built without guessing a status string per source_module.
 *   - Table 14/15 (e-commerce operator supplies) -- no e-commerce-operator concept exists
 *     anywhere in `core`.
 * Each gap above is a genuine, documented follow-up for whichever future story needs it
 * (most naturally once the underlying `core`/party data model gains the missing concept),
 * not an oversight.
 */

export type Gstr1DocType = "invoice" | "credit_note" | "debit_note";

/** One outward-supply document (invoice, credit note, or debit note), normalized from
 * `core.documents`/`core.document_lines` plus the resolved place-of-supply/GSTIN facts
 * COMPLY-P0-03.4/04.4 already know how to produce -- the shared input every classification
 * and aggregation function in this folder consumes.
 *
 * COMPLY-P0-07.2 (GSTR-3B Preparation) extracted this same shape (plus one field GSTR-1
 * has no use for, `gstRegistrationType`) into `../shared/types.ts`'s own
 * `OutwardSupplyDocument` once GSTR-3B needed the identical `core.documents`/
 * `core.document_lines` read -- this is a plain alias, not a redefinition, so every
 * existing consumer/test in this folder keeps working unchanged. */
export type { OutwardSupplyDocument as Gstr1SourceDocument } from "../shared/types";

/** Table 4A -- B2B Invoices (regular, registered recipients). One row per invoice. */
export type Gstr1B2bRow = {
  documentId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  recipientGstin: string;
  recipientName: string;
  invoiceValue: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

/** Table 5A -- B2C (Large) Invoices: inter-state supplies to unregistered persons above
 * the effective threshold. One row per invoice. */
export type Gstr1B2clRow = {
  documentId: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  invoiceValue: number;
  taxableValue: number;
  igstAmount: number;
};

/** Table 7 -- B2C (Others): a NET, state-wise summary of every unregistered-recipient
 * supply that isn't B2C Large (i.e. every intra-state B2C supply of any value, plus
 * inter-state B2C supplies at or below the threshold) -- credit/debit notes in this same
 * bucket adjust the total, matching how the real GSTR-1 form nets small-value B2C credit
 * notes into this same aggregate rather than reporting them invoice-wise (only a
 * threshold-crossing credit/debit note against an unregistered person is reported
 * separately, in Table 9B CDNUR). `buyerStateCode` is `null` only for an intra-state
 * bucket where the buyer's state equals the seller's own state and was resolved (never for
 * an unresolved/"unknown" place of supply -- those documents are excluded entirely, see
 * `Gstr1Return.excludedDocumentIds`). */
export type Gstr1B2csRow = {
  buyerStateCode: string;
  netTaxableValue: number;
  netCgstAmount: number;
  netSgstAmount: number;
  netIgstAmount: number;
  /** Every source document (invoice, credit note, or debit note) that contributed to
   * this state's net figures -- COMPLY-P0-07.4's own "every amount traceable to source
   * transactions" starts from this list; this story surfaces it now rather than requiring
   * that future story to re-derive it. */
  documentIds: string[];
};

/** Table 9B -- Credit/Debit Notes (Registered or Unregistered). One row per note. */
export type Gstr1CreditDebitNoteRow = {
  documentId: string;
  docType: "credit_note" | "debit_note";
  noteNumber: string | null;
  noteDate: string;
  /** `null` for a CDNUR row (recipient not registered). */
  recipientGstin: string | null;
  recipientName: string;
  /** The ORIGINAL invoice this note references, when this platform's own `core.documents.
   * source_ref` recorded one -- `null` when not linked (GSTR-1 itself doesn't require this
   * link for a valid filing; it's carried here purely for this platform's own drill-down
   * convenience, COMPLY-P0-07.4's own likely job to surface). */
  againstInvoiceId: string | null;
  noteValue: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

/** Table 12 -- HSN-wise summary of outward supplies, across every included document
 * (B2B + B2CL + B2C Others + CDNR/CDNUR, net of credit/debit notes). */
export type Gstr1HsnRow = {
  hsnCode: string;
  totalQuantity: number;
  totalValue: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

export type Gstr1Return = {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  /** The B2C Large threshold actually applied, and which rule version it came from --
   * surfaced so a reviewer can see WHY a given invoice landed in Table 5 vs. Table 7,
   * never a bare number with no citation (backlog rule 12). `null` when no rule version
   * covers this period at all (see `queries.ts`'s own docstring for what happens then). */
  b2cLargeThreshold: { thresholdInr: number; source: string } | null;
  b2b: Gstr1B2bRow[];
  b2cLarge: Gstr1B2clRow[];
  b2cOthers: Gstr1B2csRow[];
  creditDebitNotes: Gstr1CreditDebitNoteRow[];
  hsnSummary: Gstr1HsnRow[];
  totals: {
    taxableValue: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
  };
  /** Documents this period found but could not place in any table above -- an export
   * (Table 6, not modeled) or a document whose place of supply couldn't be resolved at
   * all. Never silently dropped from the return's own record of what it saw. */
  excluded: { documentId: string; reason: "export" | "unknown_place_of_supply" }[];
  /** The GSTR-1 table numbers this function deliberately does not populate, and why --
   * see this file's own top-of-file docstring for the full list. Read this before treating
   * a `Gstr1Return` as a complete filing-ready return: it is a prepared DRAFT of the tables
   * this platform's own transaction data can currently support, not a full GSTR-1. */
  notModeled: string[];
};
