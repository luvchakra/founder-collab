/**
 * COMPLY-P0-07.2 (GSTR-3B Preparation): the shape this module organizes a period's own
 * summary return into, matching the real GSTR-3B form's own table numbering. NOT a new
 * persisted entity -- see `queries.ts`'s own docstring for the same "compute on demand,
 * persist later" reasoning COMPLY-P0-07.1 already established.
 *
 * **A real, current (2026) regulatory fact this design deliberately leans on, verified via
 * web search rather than assumed**: GSTR-3B's own outward-supply figures (Tables 3.1 and
 * 3.2) are, under GSTN's current rules, auto-populated from the taxpayer's own filed
 * GSTR-1/IFF data and are now NON-EDITABLE at the time of filing (multiple 2026-dated
 * sources -- Busy.in's, ClearTax's, and IncorpX's own GSTR-3B guides -- describe this
 * consistently, one explicitly naming the November 2025 tax period as when Table 3.2's own
 * auto-populated values became "use system-generated values only"). That is exactly why
 * this preparer's own Section 3.1(a)/3.2 figures are derived by RE-SHAPING
 * COMPLY-P0-07.1's own `getGstr1Return` output rather than independently re-deriving them
 * from `core.documents` a second time with a second, possibly-diverging classification --
 * this mirrors the real GST system's own "GSTR-1 is the source, GSTR-3B reads it" design,
 * not just a convenient code-reuse choice.
 *
 * Table coverage is deliberately partial -- every table this module does NOT populate is
 * named in `Gstr3bReturn.notModeled`, per backlog rule 11/12 (same discipline as
 * COMPLY-P0-07.1's own `Gstr1Return.notModeled`):
 *   - Table 3.1(c)/(d)/(e) (nil-rated/exempted/non-GST outward supplies; inward supplies
 *     liable to reverse charge; non-GST outward supplies) -- no per-line tax TREATMENT or
 *     reverse-charge-liability flag is recorded on `core.document_lines`/`core.documents`
 *     today (same gap COMPLY-P0-07.1's own Table 8 already flagged).
 *   - Table 3.1.1 (e-commerce operator supplies under section 9(5)) -- no e-commerce-
 *     operator concept exists anywhere in `core`.
 *   - Table 3.2's own UIN-holder column -- no UIN (Unique Identification Number, for
 *     embassies/UN bodies/certain notified persons) concept is recorded on
 *     `core.tax_identities`; only `regular`/`composition`/`unregistered` registration
 *     types exist.
 *   - Table 4A(1)/(2)/(3) (ITC on import of goods, import of services, and ISD) and
 *     Table 4B (ITC reversed under Rules 42/43 and Section 17(5)) and Table 4D (ineligible
 *     ITC) -- none of these are derivable from this platform's own purchase-order data at
 *     all; they need import documentation, an ISD allocation mechanism, and a
 *     Section-17(5)-blocked-credit classification this platform doesn't have.
 *   - Table 5 (exempt/nil/non-GST INWARD supplies, incl. purchases from composition
 *     dealers) -- same per-line-treatment gap as 3.1(c).
 *   - Table 5.1 (interest and late fee) and Table 6 (tax payment/cash-vs-credit-ledger
 *     reconciliation) -- these depend on the ACTUAL filing date vs. due date and this
 *     platform's own payment/cash-ledger data, neither of which a PREPARATION step (as
 *     opposed to an actual filing event) has any business computing.
 * Each gap is a genuine, documented follow-up (most naturally once COMPLY-P0-08's
 * reconciliation/IMS work gives this module a real GSTR-2B-matched ITC figure, at which
 * point Table 4A(5) below should be re-derived from THAT rather than this story's own
 * provisional own-books figure), not an oversight.
 */

/** Table 3.1(a)/(b): net taxable value + tax for one bucket ("taxable, other than
 * zero-rated/nil/exempt" or "zero-rated," i.e. exports). */
export type Gstr3bOutwardBucket = {
  taxableValue: number;
  igstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  /** Every source document (invoice, credit note, or debit note) netted into this
   * bucket -- COMPLY-P0-07.4's own drill-down starting point, same convention
   * `Gstr1B2csRow.documentIds` already established. */
  documentIds: string[];
};

/** Table 3.2: one state's own net inter-state supply to unregistered persons OR to
 * composition dealers (kept as two parallel maps, not one row, since the real form
 * itself has separate unregistered/composition columns per state). */
export type Gstr3bInterStateStateRow = {
  buyerStateCode: string;
  netTaxableValue: number;
  netIgstAmount: number;
  documentIds: string[];
};

/** Table 4A(5) "All Other ITC" -- this story's own single, explicitly-provisional ITC
 * figure. See `queries.ts`'s own docstring for exactly what it is and is not. */
export type Gstr3bItcSummary = {
  eligibleItcTaxableValue: number;
  eligibleItcCgstAmount: number;
  eligibleItcSgstAmount: number;
  eligibleItcIgstAmount: number;
  /** Always `false` today -- this figure comes from this business's own purchase records,
   * NOT a GSTR-2B match (COMPLY-P0-08's own future job). Never claim ITC is actually
   * available to claim without that reconciliation (backlog rule 11) -- surfaced as an
   * explicit field so a caller can never mistake this for a filing-ready number by
   * forgetting to read a comment. */
  reconciledWithGstr2b: false;
};

export type Gstr3bReturn = {
  businessId: string;
  periodStart: string;
  periodEnd: string;
  outwardTaxableOther: Gstr3bOutwardBucket;
  outwardZeroRated: Gstr3bOutwardBucket;
  interStateToUnregistered: Gstr3bInterStateStateRow[];
  interStateToComposition: Gstr3bInterStateStateRow[];
  itc: Gstr3bItcSummary;
  /** Documents COMPLY-P0-07.1's own GSTR-1 draft already excluded (unresolved place of
   * supply) -- carried through so a reviewer sees the same gap from either return, never
   * silently reconciled away. Exports are NOT included here; they are a real, populated
   * bucket (`outwardZeroRated`) in GSTR-3B, unlike GSTR-1's own Table 6 (not modeled). */
  excludedUnknownPlaceOfSupply: string[];
  notModeled: string[];
};
