/**
 * COMPLY-P0-08.2 (Purchase-to-2B Matching): compares this business's own purchase
 * register (`lib/filing/queries.ts`'s own `getPurchaseRegister`, reused rather than
 * re-queried) against an imported GSTR-2B statement (COMPLY-P0-08.1) for the same
 * period.
 *
 * SCOPE, deliberately narrowed to SUPPLIER level, not invoice level (backlog rule 5,
 * "do not implement future stories implicitly" -- named here as a real, current
 * limitation rather than a speculative future one): a genuine invoice-level match needs
 * a join key both sides actually carry. GSTR-2B's own key is the SUPPLIER's invoice
 * number (`inum`, COMPLY-P0-08.1's own research) -- but `core.documents` for a
 * `purchase_order` stores only THIS business's own PO number (`number`, minted via
 * `core.next_number()`), never the supplier's own invoice number. Checked
 * `module-inventory`'s own purchase-order creation flow and `source_ref` usage this
 * story (the documented extension point for module-specific fields per
 * `core.documents`'s own migration comment) -- neither captures a vendor/supplier
 * invoice number anywhere today, so an invoice-level join is not reachable with the
 * current data model, not merely unimplemented. Flagged here as a concrete follow-up for
 * `module-inventory`: add a vendor-invoice-number field to its own purchase-order entry
 * flow (most naturally `source_ref.vendor_invoice_number`, needing no new column) before
 * a future story can do real invoice-level matching.
 *
 * Supplier GSTIN, by contrast, IS a reliable join key on both sides today -- a
 * registered supplier has exactly one GSTIN per state, `core.tax_identities` already
 * carries it for every party this business's purchase register uses (`getPurchaseRegister`
 * already joins it), and `gst.gstr2b_documents.supplier_gstin` is the same concept from
 * GSTN's own side. This story reconciles at that level: for each period, sums this
 * business's own recorded purchases from each supplier GSTIN and compares against what
 * GSTN's own GSTR-2B reports for that same GSTIN.
 */

export type PurchaseMatchStatus = "matched" | "mismatched" | "missing_in_2b" | "missing_in_books";

/** One supplier's own purchase totals, from THIS BUSINESS's books
 * (`lib/filing/queries.ts`'s own `getPurchaseRegister().bySupplier`). A `null` gstin
 * entry (an unregistered supplier, or a missing GSTIN on file) is never matched --
 * see `match.ts`'s own docstring for why. */
export type BookSupplierTotal = {
  gstin: string | null;
  name: string;
  taxableValue: number;
  tax: number;
};

/** One supplier's own totals as GSTN's GSTR-2B reports them for this period --
 * `b2b` invoices plus `cdnr` credit/debit notes for the same `supplier_gstin`, summed
 * as their stored signs already encode (see `match.ts`'s own docstring for the honest
 * limit on credit-note sign convention). */
export type Gstr2bSupplierTotal = {
  gstin: string;
  tradeName: string | null;
  taxableValue: number;
  tax: number;
};

export type SupplierReconciliationRow = {
  status: PurchaseMatchStatus;
  gstin: string;
  /** The books' own supplier name when present (a books-only or matched/mismatched
   * row), else GSTN's own trade name (a 2B-only row) -- whichever side actually has a
   * name to show. */
  name: string | null;
  booksTaxableValue: number | null;
  booksTax: number | null;
  gstr2bTaxableValue: number | null;
  gstr2bTax: number | null;
  /** `gstr2bTaxableValue - booksTaxableValue` -- null on a one-sided row (nothing to
   * take a delta of). Positive means GSTN reports MORE than this business's own books. */
  taxableValueDelta: number | null;
  taxDelta: number | null;
};

export type PurchaseReconciliationResult = {
  businessId: string;
  returnPeriod: string;
  rows: SupplierReconciliationRow[];
  matchedCount: number;
  mismatchedCount: number;
  missingIn2bCount: number;
  missingInBooksCount: number;
  /** Purchases from a supplier with no GSTIN on file at all -- structurally excluded
   * from this reconciliation (an unregistered supplier's invoice cannot appear in a
   * GSTR-2B, which is sourced only from registered suppliers' own GSTR-1 filings), never
   * counted as `missing_in_2b`. Surfaced separately so this reconciliation doesn't
   * silently drop real purchase spend from view -- COMPLY-P0-08.6's own Exception Queue
   * is a more natural home for actually acting on this, this story only reports the
   * total. */
  excludedNoGstinTaxableValue: number;
};
