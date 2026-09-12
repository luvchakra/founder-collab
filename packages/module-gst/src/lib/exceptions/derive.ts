import type { PurchaseReconciliationResult } from "../reconciliation/types";
import type { ItcAvailabilitySummary } from "../itc/types";
import type { ExceptionCandidate } from "./types";

/**
 * COMPLY-P0-08.6: pure, no-I/O -- turns an already-computed COMPLY-P0-08.2 reconciliation
 * result and an already-computed COMPLY-P0-08.5 ITC availability summary into the
 * candidate exceptions this period's own data currently supports. Deliberately takes
 * already-computed results rather than raw documents, so this function has zero
 * dependency on how those two upstream computations get their own data -- the same "pure
 * aggregation, thin query layer" split every other multi-file computation in this module
 * already follows.
 */

function formatInr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function deriveReconciliationExceptions(reconciliation: PurchaseReconciliationResult, itc: ItcAvailabilitySummary | null): ExceptionCandidate[] {
  const candidates: ExceptionCandidate[] = [];

  for (const row of reconciliation.rows) {
    if (row.status === "mismatched") {
      candidates.push({
        exceptionType: "supplier_mismatch",
        referenceKey: row.gstin,
        summary: `${row.name ?? row.gstin} (${row.gstin}): books show ${formatInr(row.booksTaxableValue ?? 0)} taxable / ${formatInr(row.booksTax ?? 0)} tax, GSTR-2B shows ${formatInr(row.gstr2bTaxableValue ?? 0)} taxable / ${formatInr(row.gstr2bTax ?? 0)} tax.`,
      });
    } else if (row.status === "missing_in_2b") {
      candidates.push({
        exceptionType: "missing_in_2b",
        referenceKey: row.gstin,
        summary: `${row.name ?? row.gstin} (${row.gstin}): ${formatInr(row.booksTaxableValue ?? 0)} recorded in your books for this period, but not found in GSTR-2B.`,
      });
    } else if (row.status === "missing_in_books") {
      candidates.push({
        exceptionType: "missing_in_books",
        referenceKey: row.gstin,
        summary: `${row.name ?? row.gstin} (${row.gstin}): ${formatInr(row.gstr2bTaxableValue ?? 0)} reported in GSTR-2B, but not found in your own books for this period.`,
      });
    }
  }

  if (itc) {
    for (const row of itc.rows) {
      if (row.imsStatus === "pending") {
        candidates.push({
          exceptionType: "ims_pending",
          referenceKey: row.gstr2bDocumentId,
          summary: `Invoice ${row.documentNumber} from ${row.supplierTradeName ?? row.supplierGstin} (${row.supplierGstin}) is Pending in IMS -- accept or reject it before filing GSTR-3B for this period.`,
        });
      }
    }
  }

  return candidates;
}
