import { getPurchaseRegister } from "../filing/queries";
import { getGstr2bStatementWithDocuments } from "../gstr2b/queries";
import { matchPurchasesTo2b } from "./match";
import type { BookSupplierTotal, Gstr2bSupplierTotal, PurchaseReconciliationResult } from "./types";
import type { Gstr2bDocument } from "../gstr2b/types";

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

/**
 * The one entry point COMPLY-P0-08.3 (Match Explanation)/COMPLY-P0-08.5 (ITC View)/
 * COMPLY-P0-08.6 (Exception Queue) will all build on. Returns `null` only when no GSTR-2B
 * statement has been imported for this period yet (COMPLY-P0-08.1's own
 * `importGstr2bStatement` not yet called) -- a real, common state (a period whose 2B
 * hasn't been fetched/uploaded), not an error.
 */
export async function getPurchaseReconciliation(businessId: string, returnPeriod: string): Promise<PurchaseReconciliationResult | null> {
  const statement = await getGstr2bStatementWithDocuments(businessId, returnPeriod);
  if (!statement) return null;

  const { start, end } = periodToDateRange(returnPeriod);
  const register = await getPurchaseRegister(businessId, start, end);

  const books: BookSupplierTotal[] = register.bySupplier.map((s) => ({ gstin: s.gstin, name: s.name, taxableValue: s.taxableValue, tax: s.tax }));
  const gstr2b = summarizeGstr2bBySupplier(statement.documents);

  return matchPurchasesTo2b(businessId, returnPeriod, books, gstr2b);
}
