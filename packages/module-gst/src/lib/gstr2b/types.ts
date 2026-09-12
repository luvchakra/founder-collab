/**
 * COMPLY-P0-08.1 (GSTR-2B Fetch/Import): the persisted, normalized shape of an imported
 * GSTR-2B statement -- see `supabase/migrations/20260912140000_gst_gstr2b_statements.sql`'s
 * own docstring for the full research trail behind these field names and the deliberate
 * `b2b`/`cdnr`-only scope. `RawGstr2bJson` (this file's other export) is the INPUT shape
 * `parse.ts` accepts; these are the OUTPUT shapes this module's own database/queries use.
 */

export type Gstr2bSection = "b2b" | "cdnr";
export const GSTR2B_SECTIONS: Gstr2bSection[] = ["b2b", "cdnr"];

export type Gstr2bDocumentType = "invoice" | "credit_note" | "debit_note";

export type Gstr2bStatementSource = "manual_upload" | "gsp_fetch";

/** One B2B invoice or CDNR credit/debit note, normalized from the raw GSTN JSON into this
 * platform's own column shape. */
export type Gstr2bDocument = {
  id: string;
  statementId: string;
  businessId: string;
  section: Gstr2bSection;
  documentType: Gstr2bDocumentType;
  supplierGstin: string;
  supplierTradeName: string | null;
  documentNumber: string;
  documentDate: string | null;
  documentValue: number | null;
  placeOfSupply: string | null;
  reverseCharge: boolean;
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  cessAmount: number;
  /** Per-invoice ITC-eligible flag GSTN's own GSTR-2B JSON carries (`itc_elg`). Defaults to
   * `true` when the raw JSON omits the flag entirely -- the common case for an ordinary
   * eligible invoice; `parse.ts` only ever sets this `false` when the raw JSON explicitly
   * says so. */
  itcAvailable: boolean;
  /** Populated only when `itcAvailable` is `false` -- the real GSTN GSTR-2B advisory's own
   * wording (Section 16(4) time-bar, or supplier/POS same-state-recipient-different-state),
   * passed through verbatim, never re-derived by this platform's own code. */
  ineligibilityReason: string | null;
  /** The SUPPLIER's own GSTR-1/IFF filing period for this document (`supprd`) -- distinct
   * from this statement's own `returnPeriod` (the RECIPIENT's period this 2B was generated
   * for), since a supplier can file late, in a later period than the recipient's own. */
  supplierFilingPeriod: string | null;
  supplierFiledDate: string | null;
  createdAt: string;
};

export type Gstr2bStatement = {
  id: string;
  businessId: string;
  /** `YYYY-MM` -- the recipient's own return period this statement was generated for. */
  returnPeriod: string;
  gstin: string | null;
  generatedOn: string | null;
  fetchedAt: string;
  source: Gstr2bStatementSource;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Gstr2bStatementWithDocuments = Gstr2bStatement & {
  documents: Gstr2bDocument[];
};

/**
 * The raw GSTN GSTR-2B JSON shape this module's own `parse.ts` accepts -- a best-effort,
 * cross-referenced-from-multiple-independent-sources reconstruction (see the migration
 * file's own docstring for exactly which field names were verified and how, and its
 * "honest limit" paragraph on why the authoritative schema could not be fetched directly
 * this story). Deliberately permissive (`Record<string, unknown>`-shaped optional fields
 * throughout, everything but the bare minimum optional) so a real-world statement missing
 * a field this reconstruction assumed present degrades to a skipped/partial row rather
 * than a hard parse failure -- `parse.ts`'s own `parseGstr2bJson` returns a list of
 * per-document warnings alongside its parsed documents for exactly this reason.
 */
export type RawGstr2bInvoiceLine = {
  inum?: unknown;
  idt?: unknown;
  val?: unknown;
  pos?: unknown;
  rev?: unknown;
  typ?: unknown;
  txval?: unknown;
  iamt?: unknown;
  camt?: unknown;
  samt?: unknown;
  csamt?: unknown;
  itc_elg?: unknown;
  rsn?: unknown;
};

export type RawGstr2bNoteLine = {
  ntty?: unknown;
  nt_num?: unknown;
  nt_dt?: unknown;
  val?: unknown;
  pos?: unknown;
  rev?: unknown;
  typ?: unknown;
  txval?: unknown;
  iamt?: unknown;
  camt?: unknown;
  samt?: unknown;
  csamt?: unknown;
  itc_elg?: unknown;
  rsn?: unknown;
};

export type RawGstr2bSupplierBlock = {
  ctin?: unknown;
  trdnm?: unknown;
  supprd?: unknown;
  supfildt?: unknown;
  inv?: unknown;
  nt?: unknown;
};

export type RawGstr2bJson = {
  gstin?: unknown;
  /** `MMYYYY`, e.g. `"092026"` -- GSTN's own "filing period" field name, per this
   * migration's own research (`fp` is used consistently across the GSTR-1/2A/2B JSON
   * family). */
  fp?: unknown;
  gendt?: unknown;
  docdata?: {
    b2b?: unknown;
    cdnr?: unknown;
  };
};

export type Gstr2bParseWarning = { section: Gstr2bSection; supplierGstin: string | null; documentNumber: string | null; message: string };

export type Gstr2bParseResult = {
  returnPeriod: string | null;
  gstin: string | null;
  documents: Omit<Gstr2bDocument, "id" | "statementId" | "businessId" | "createdAt">[];
  warnings: Gstr2bParseWarning[];
};
