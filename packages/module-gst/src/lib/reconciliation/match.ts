import type { BookSupplierTotal, Gstr2bSupplierTotal, PurchaseReconciliationResult, SupplierReconciliationRow } from "./types";

/**
 * COMPLY-P0-08.2: pure, no-I/O supplier-level matching -- see `types.ts`'s own docstring
 * for the full scope/limitation research trail. Deliberately schema-free, matching the
 * same on-demand-computation pattern `lib/returns/{gstr1,gstr3b,gstr9}/queries.ts` already
 * established for a "prepare" function with no persisted state of its own -- a genuine
 * exception QUEUE (tracked, resolvable over time) is COMPLY-P0-08.6's own job, not this
 * one's; this function is re-run fresh every time it's called.
 *
 * HONEST LIMIT on credit-note sign convention (same "state it plainly" discipline
 * COMPLY-P0-08.1's own migration already applied): whether GSTN's real GSTR-2B JSON
 * encodes a credit note's `txval`/tax fields as already-negative, or positive with only
 * the note-type flag distinguishing it, could not be confirmed via the sources reachable
 * this story. `Gstr2bSupplierTotal` sums every `gst.gstr2b_documents` row's stored values
 * exactly as `parse.ts` persisted them (no sign-flipping applied here) -- if a real GSTN
 * statement turns out to encode credit notes as positive values needing explicit
 * subtraction, a supplier's own GSTR-2B total here would be overstated by twice the
 * credit-note amount. Flagged as a concrete follow-up to verify against a real downloaded
 * 2B statement, not silently assumed correct.
 *
 * TOLERANCE: a small, fixed, internal reconciliation constant (₹1 on taxable value and
 * on total tax each) -- NOT a government-mandated threshold (so, unlike an e-invoice/
 * e-way-bill threshold, this is not pulled from `gst.tax_rules`; backlog rule 6's
 * "versioned, source-referenced" discipline applies to REGULATORY facts, and rounding
 * tolerance in a reconciliation tool is a software design choice, not one). Named
 * plainly here rather than left as a magic number so a future story can revisit it.
 */
export const RECONCILIATION_TOLERANCE = 1;

function within(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function matchPurchasesTo2b(
  businessId: string,
  returnPeriod: string,
  books: BookSupplierTotal[],
  gstr2b: Gstr2bSupplierTotal[],
  tolerance: number = RECONCILIATION_TOLERANCE,
): PurchaseReconciliationResult {
  const registeredBooks = books.filter((b): b is BookSupplierTotal & { gstin: string } => b.gstin !== null);
  const excludedNoGstinTaxableValue = books.filter((b) => b.gstin === null).reduce((sum, b) => sum + b.taxableValue, 0);

  const booksByGstin = new Map<string, BookSupplierTotal & { gstin: string }>();
  for (const entry of registeredBooks) {
    // Two book rows could in principle share a GSTIN if getPurchaseRegister's own
    // name|gstin grouping key ever produced two entries for one supplier under
    // different recorded names -- summed together here rather than picking one
    // arbitrarily, so this reconciliation's own totals never silently drop spend.
    const existing = booksByGstin.get(entry.gstin);
    booksByGstin.set(entry.gstin, existing ? { ...existing, taxableValue: existing.taxableValue + entry.taxableValue, tax: existing.tax + entry.tax } : entry);
  }

  const gstr2bByGstin = new Map<string, Gstr2bSupplierTotal>();
  for (const entry of gstr2b) {
    const existing = gstr2bByGstin.get(entry.gstin);
    gstr2bByGstin.set(entry.gstin, existing ? { ...existing, taxableValue: existing.taxableValue + entry.taxableValue, tax: existing.tax + entry.tax } : entry);
  }

  const allGstins = new Set<string>([...booksByGstin.keys(), ...gstr2bByGstin.keys()]);
  const rows: SupplierReconciliationRow[] = [];
  let matchedCount = 0;
  let mismatchedCount = 0;
  let missingIn2bCount = 0;
  let missingInBooksCount = 0;

  for (const gstin of allGstins) {
    const book = booksByGstin.get(gstin) ?? null;
    const two_b = gstr2bByGstin.get(gstin) ?? null;

    if (book && !two_b) {
      missingIn2bCount++;
      rows.push({
        status: "missing_in_2b",
        gstin,
        name: book.name,
        booksTaxableValue: book.taxableValue,
        booksTax: book.tax,
        gstr2bTaxableValue: null,
        gstr2bTax: null,
        taxableValueDelta: null,
        taxDelta: null,
      });
      continue;
    }

    if (!book && two_b) {
      missingInBooksCount++;
      rows.push({
        status: "missing_in_books",
        gstin,
        name: two_b.tradeName,
        booksTaxableValue: null,
        booksTax: null,
        gstr2bTaxableValue: two_b.taxableValue,
        gstr2bTax: two_b.tax,
        taxableValueDelta: null,
        taxDelta: null,
      });
      continue;
    }

    // Both present (book && two_b, guaranteed by allGstins' construction).
    const b = book!;
    const g = two_b!;
    const taxableValueDelta = g.taxableValue - b.taxableValue;
    const taxDelta = g.tax - b.tax;
    const matched = within(b.taxableValue, g.taxableValue, tolerance) && within(b.tax, g.tax, tolerance);
    if (matched) matchedCount++;
    else mismatchedCount++;
    rows.push({
      status: matched ? "matched" : "mismatched",
      gstin,
      name: b.name ?? g.tradeName,
      booksTaxableValue: b.taxableValue,
      booksTax: b.tax,
      gstr2bTaxableValue: g.taxableValue,
      gstr2bTax: g.tax,
      taxableValueDelta,
      taxDelta,
    });
  }

  rows.sort((a, b) => (a.gstin < b.gstin ? -1 : a.gstin > b.gstin ? 1 : 0));

  return {
    businessId,
    returnPeriod,
    rows,
    matchedCount,
    mismatchedCount,
    missingIn2bCount,
    missingInBooksCount,
    excludedNoGstinTaxableValue,
  };
}
