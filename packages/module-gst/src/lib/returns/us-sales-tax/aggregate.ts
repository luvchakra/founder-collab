import type { ResolvedUsSaleLine, UsSalesTaxReturn } from "./types";

/**
 * COMPLY-P1-02.7: the pure summation over an already-resolved line list -- every line's
 * own `taxableAmount`/`taxAmount` is already SIGNED (negative for a credit note), so every
 * total here is a plain sum, the same credit-note-subtracts convention `aggregateGstr1`
 * already established. DB-independent and unit-tested standalone, matching this module's
 * "resolve async, aggregate pure" split for every other return preparer.
 */
export function aggregateUsSalesTaxReturn(
  businessId: string,
  jurisdiction: string,
  periodStart: string,
  periodEnd: string,
  lines: ResolvedUsSaleLine[],
  notModeled: string[],
): UsSalesTaxReturn {
  let grossSales = 0;
  let exemptSales = 0;
  let taxableSales = 0;
  let unresolvedSales = 0;
  let taxCollected = 0;
  const exemptSalesByReason = { certificate: 0, productTaxability: 0, lineNotTaxable: 0 };

  for (const line of lines) {
    grossSales += line.taxableAmount;

    if (!line.resolved) {
      unresolvedSales += line.taxableAmount;
      continue;
    }

    if (line.treatment === "exempt") {
      exemptSales += line.taxableAmount;
      if (line.exemptionReason === "certificate") exemptSalesByReason.certificate += line.taxableAmount;
      else if (line.exemptionReason === "line_not_taxable") exemptSalesByReason.lineNotTaxable += line.taxableAmount;
      else exemptSalesByReason.productTaxability += line.taxableAmount;
    } else {
      taxableSales += line.taxableAmount;
      taxCollected += line.taxAmount ?? 0;
    }
  }

  return {
    businessId,
    jurisdiction,
    periodStart,
    periodEnd,
    grossSales,
    exemptSales,
    exemptSalesByReason,
    taxableSales,
    unresolvedSales,
    taxCollected,
    lines,
    notModeled,
  };
}
