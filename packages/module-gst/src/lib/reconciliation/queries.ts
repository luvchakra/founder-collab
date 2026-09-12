import { getPurchaseRegister } from "../filing/queries";
import type { PurchaseRegister } from "../filing/types";
import { getGstr2bStatementWithDocuments } from "../gstr2b/queries";
import { explainSupplierMatch } from "./explain";
import { matchPurchasesTo2b } from "./match";
import type { BookSupplierTotal, Gstr2bSupplierTotal, PurchaseReconciliationResult, SupplierBookLine, SupplierMatchDrilldown } from "./types";
import type { Gstr2bDocument, Gstr2bStatementWithDocuments } from "../gstr2b/types";

/**
 * COMPLY-P0-08.2: assembles both sides of the match and calls the pure matcher --
 * `getPurchaseRegister` (COMPLY-P0-04's own filing register, already computing exactly
 * the per-supplier taxable-value/tax totals this story needs) is reused rather than
 * re-querying `core.documents` a second time, matching backlog rule 1/2 ("reuse Core
 * data through approved contracts" -- `getPurchaseRegister` is this module's own
 * existing, already-correct query, not a contract call, but the same "don't duplicate an
 * existing query" discipline applies within one module too).
 */

/** `YYYY-MM` -> the calendar month's own first/last date, in the `YYYY-MM-DD` shape
 * `getPurchaseRegister` expects. Pure, no timezone assumptions beyond plain date-string
 * arithmetic (matches how every other period-shaped query in this module already treats
 * dates as plain calendar dates, not timestamps). */
export function periodToDateRange(returnPeriod: string): { start: string; end: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(returnPeriod);
  if (!match) throw new Error(`"${returnPeriod}" is not a valid return period (expected YYYY-MM).`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const start = `${match[1]}-${match[2]}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function summarizeGstr2bBySupplier(documents: Gstr2bDocument[]): Gstr2bSupplierTotal[] {
  const bySupplier = new Map<string, Gstr2bSupplierTotal>();
  for (const doc of documents) {
    const tax = doc.igstAmount + doc.cgstAmount + doc.sgstAmount;
    const existing = bySupplier.get(doc.supplierGstin);
    if (existing) {
      existing.taxableValue += doc.taxableValue;
      existing.tax += tax;
      if (!existing.tradeName && doc.supplierTradeName) existing.tradeName = doc.supplierTradeName;
    } else {
      bySupplier.set(doc.supplierGstin, { gstin: doc.supplierGstin, tradeName: doc.supplierTradeName, taxableValue: doc.taxableValue, tax });
    }
  }
  return [...bySupplier.values()];
}

/** Fetches both sides once -- shared by `getPurchaseReconciliation` and
 * `getSupplierMatchDrilldown` so a caller that wants both (a reconciliation summary page
 * that also renders one supplier's own drill-down) doesn't trigger the underlying
 * `getPurchaseRegister`/`getGstr2bStatementWithDocuments` reads twice over. Returns `null`
 * only when no GSTR-2B statement has been imported for this period yet (COMPLY-P0-08.1's
 * own `importGstr2bStatement` not yet called) -- a real, common state, not an error. */
async function loadReconciliationInputs(businessId: string, returnPeriod: string): Promise<{ register: PurchaseRegister; statement: Gstr2bStatementWithDocuments } | null> {
  const statement = await getGstr2bStatementWithDocuments(businessId, returnPeriod);
  if (!statement) return null;
  const { start, end } = periodToDateRange(returnPeriod);
  const register = await getPurchaseRegister(businessId, start, end);
  return { register, statement };
}

/**
 * The one entry point COMPLY-P0-08.5 (ITC View)/COMPLY-P0-08.6 (Exception Queue) will
 * build on. Returns `null` only when no GSTR-2B statement has been imported for this
 * period yet -- see `loadReconciliationInputs`'s own docstring.
 */
export async function getPurchaseReconciliation(businessId: string, returnPeriod: string): Promise<PurchaseReconciliationResult | null> {
  const inputs = await loadReconciliationInputs(businessId, returnPeriod);
  if (!inputs) return null;

  const books: BookSupplierTotal[] = inputs.register.bySupplier.map((s) => ({ gstin: s.gstin, name: s.name, taxableValue: s.taxableValue, tax: s.tax }));
  const gstr2b = summarizeGstr2bBySupplier(inputs.statement.documents);

  return matchPurchasesTo2b(businessId, returnPeriod, books, gstr2b);
}

/**
 * COMPLY-P0-08.3 (Match Explanation): one supplier GSTIN's own full drill-down --
 * the deterministic candidate causes for its reconciliation status
 * (`explainSupplierMatch`) plus the real invoice-/note-level line items on each side, for
 * a human to compare by eye (see `types.ts`'s own docstring for why this platform cannot
 * pair them automatically yet). Returns `null` only when no GSTR-2B statement exists for
 * this period at all -- a `gstin` that was simply never part of this reconciliation
 * (never purchased from, never in the 2B) still returns a result, just with `row: null`
 * and both line lists empty, since "you asked about a GSTIN with nothing on either side"
 * is a real, valid answer, not a missing-statement error.
 */
export async function getSupplierMatchDrilldown(businessId: string, returnPeriod: string, gstin: string): Promise<SupplierMatchDrilldown | null> {
  const inputs = await loadReconciliationInputs(businessId, returnPeriod);
  if (!inputs) return null;

  const books: BookSupplierTotal[] = inputs.register.bySupplier.map((s) => ({ gstin: s.gstin, name: s.name, taxableValue: s.taxableValue, tax: s.tax }));
  const gstr2b = summarizeGstr2bBySupplier(inputs.statement.documents);
  const result = matchPurchasesTo2b(businessId, returnPeriod, books, gstr2b);
  const row = result.rows.find((r) => r.gstin === gstin) ?? null;

  const bookLines: SupplierBookLine[] = inputs.register.csvRows
    .filter((r) => r.supplier_gstin === gstin)
    .map((r) => ({ poNumber: r.po_number, orderDate: r.order_date, taxableValue: r.subtotal, cgst: r.cgst, sgst: r.sgst, igst: r.igst }));
  const gstr2bLines: Gstr2bDocument[] = inputs.statement.documents.filter((d) => d.supplierGstin === gstin);

  return {
    businessId,
    returnPeriod,
    gstin,
    row,
    possibleCauses: row ? explainSupplierMatch(row).possibleCauses : [],
    bookLines,
    gstr2bLines,
  };
}
