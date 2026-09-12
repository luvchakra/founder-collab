/**
 * COMPLY-P0-07.3 (GSTR-9 Preparation): the shape this module organizes a FINANCIAL YEAR's
 * own annual return into. NOT a new persisted entity -- same "compute on demand, persist
 * later" reasoning COMPLY-P0-07.1/07.2 already established.
 *
 * Researched via web search (backlog rule 6), not assumed from memory -- GetSwipe's,
 * ClearTax's, and TaxGuru's own GSTR-9 table-wise guides, cross-checked against each
 * other: GSTR-9 has 19 tables across 6 parts; Table 4 is the outward-supplies section this
 * module can most directly compute FROM ITS OWN existing GSTR-1/GSTR-3B preparation logic,
 * re-run over the full financial year instead of one return period.
 *
 * **Design decision -- reuse, don't re-derive**: Table 4's own sub-items map directly onto
 * classifications this module already computes: 4B (B2B) and 4A (B2C, i.e. B2C Large +
 * B2C Others combined) come straight from COMPLY-P0-07.1's own `aggregateGstr1`; 4C
 * (zero-rated exports) comes from COMPLY-P0-07.2's own `aggregateGstr3bOutward` (its
 * `outwardZeroRated` bucket); 4I/4J (credit/debit notes against B2B or B2C) come from
 * `aggregateGstr1`'s own `creditDebitNotes`, split by `docType`. This is the annual-return
 * form's own real relationship to the monthly ones (GSTR-9's own instructions describe it
 * as summarizing "supplies... as declared in the returns filed during the financial
 * year") -- re-running THIS module's own already-tested classification over a
 * whole-year period, not writing new classification logic that could quietly disagree
 * with what GSTR-1/3B themselves report for the same underlying documents.
 *
 * Table coverage is deliberately partial -- every table NOT populated is named in
 * `Gstr9Return.notModeled`, per backlog rule 11/12 (same discipline as
 * COMPLY-P0-07.1/07.2's own `notModeled`):
 *   - Table 4D (SEZ with payment) / 4E (deemed exports) -- no SEZ/deemed-export flag
 *     exists on any party (the same gap `lib/place-of-supply/determine.ts` already
 *     flags).
 *   - Table 4C itself carries one documented simplification: it reports the TOTAL value
 *     of detected exports, but cannot distinguish "zero-rated with payment of tax" from
 *     "zero-rated under LUT/bond, without payment" (the real form's own 4C is specifically
 *     the WITH-PAYMENT category) -- no LUT/bond reference or export-type flag exists
 *     anywhere in `core`.
 *   - Table 4F (advances, tax paid, no invoice issued) -- no advance-receipt concept
 *     exists in `core` (the same gap COMPLY-P0-07.1's own Table 11 already flagged).
 *   - Table 4G (inward supplies liable to reverse charge) -- no reverse-charge-liability
 *     flag exists on `core.documents`.
 *   - Table 4K/4L (amendments) / 4M/4N (net/sub-totals via amendment) -- no
 *     document-amendment/revision history exists.
 *   - Table 5 (outward supplies not liable to tax -- exempt/nil/non-GST, and supplies to
 *     SEZ without payment) -- same per-line-treatment gap COMPLY-P0-07.1's own Table 8
 *     already flagged.
 *   - Table 7 (ITC reversed) and Table 8 (ITC as per GSTR-2B/2A comparison) -- neither is
 *     derivable without COMPLY-P0-08's own GSTR-2B reconciliation.
 *   - Tables 10-13 (amendments/ITC for the PRIOR financial year declared in the current
 *     year's own returns) -- no cross-financial-year amendment tracking exists.
 *   - Table 9 (tax paid, incl. cash-vs-credit-ledger split) -- needs actual payment-ledger
 *     data at filing time, not a preparation-time concern (same reasoning
 *     COMPLY-P0-07.2's own Table 6/6.1 gap already gave).
 *   - Table 14 (differential tax paid on account of declaration in Table 10/11) -- depends
 *     on Tables 10/11, themselves not modeled.
 *   - Table 15 (particulars of demands and refunds) and Table 16 (supplies received from
 *     composition taxpayers, deemed supply under Section 143, goods sent on approval) --
 *     no such data is tracked anywhere in `core`/`gst`.
 *   - Table 19 (late fee) -- an actual-filing-time concern, not preparation.
 * Each gap is a genuine, documented follow-up, not an oversight.
 */

export type Gstr9NetBucket = {
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  documentIds: string[];
};

export type Gstr9CreditDebitNoteBucket = {
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  documentIds: string[];
};

export type Gstr9Table4 = {
  /** 4A -- B2C supplies (B2C Large + B2C Others combined, net of any B2C credit/debit
   * notes already netted at the GSTR-1 aggregation level). */
  b2c: Gstr9NetBucket;
  /** 4B -- B2B supplies (including UIN holders -- this platform cannot distinguish a UIN
   * holder from any other validly-registered GSTIN, so any UIN-holder supply is included
   * here rather than broken out, matching the form's own "(including UINs)" labeling of
   * this same combined row). */
  b2b: Gstr9NetBucket;
  /** 4C -- Zero-rated supplies (exports) -- see this file's own docstring for the
   * with-payment-vs-LUT simplification this row carries. */
  zeroRatedExports: Gstr9NetBucket;
  /** 4I -- Credit notes issued in respect of B2B/B2C supplies (4B/4A above). */
  creditNotes: Gstr9CreditDebitNoteBucket;
  /** 4J -- Debit notes issued in respect of B2B/B2C supplies (4B/4A above). */
  debitNotes: Gstr9CreditDebitNoteBucket;
};

export type Gstr9HsnRow = {
  hsnCode: string;
  totalQuantity: number;
  totalValue: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

export type Gstr9Return = {
  businessId: string;
  /** The financial year this return covers, as its own inclusive start/end dates (e.g.
   * India's FY 2026-27 is `2026-04-01`..`2027-03-31`) -- GSTR-9 is always annual, never a
   * monthly/quarterly period like GSTR-1/3B. */
  fyStart: string;
  fyEnd: string;
  table4: Gstr9Table4;
  /** Table 6 -- ITC availed during the financial year. Same provisional, own-purchase-
   * records-only figure and the same `reconciledWithGstr2b: false` caveat as
   * COMPLY-P0-07.2's own `Gstr3bItcSummary` -- never a filing-ready ITC claim. */
  itcAvailed: {
    taxableValue: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    reconciledWithGstr2b: false;
  };
  /** Table 17 -- HSN-wise summary of OUTWARD supplies for the financial year. */
  hsnSummaryOutward: Gstr9HsnRow[];
  /** Table 18 -- HSN-wise summary of INWARD supplies for the financial year, from this
   * platform's own pre-existing purchase register (`lib/filing/queries.ts`'s
   * `getPurchaseRegister`) -- same provisional, own-books caveat as `itcAvailed` above. */
  hsnSummaryInward: { hsn: string; taxableValue: number; tax: number }[];
  /** Documents excluded from Table 4 entirely because their place of supply couldn't be
   * resolved -- same convention as COMPLY-P0-07.1/07.2's own excluded lists. */
  excludedUnknownPlaceOfSupply: string[];
  notModeled: string[];
};
