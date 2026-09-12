import { createClient as createCoreClient } from "@cofounderai/core/db/server";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Pure: sums a set of invoice totals -- extracted so the real arithmetic is testable
 * without a live database connection, matching this module's established convention of
 * pulling the one piece of real logic out of every DB-calling function. */
export function sumInvoiceTotals(rows: { totalAmount: number }[]): number {
  return rows.reduce((sum, row) => sum + row.totalAmount, 0);
}

/**
 * COMPLY-P0-05.1 (E-Invoice Eligibility): a rough, this-business's-own-data-only PROXY for
 * "aggregate turnover" -- explicitly NOT the legally exact Aggregate Annual Turnover
 * (AATO) GST law actually tests the e-invoice obligation against. Real AATO aggregates
 * every GSTIN registered under the same PAN and looks at the HIGHEST turnover across every
 * financial year since 2017-18; this platform has no cross-GSTIN/PAN aggregation and no
 * financial-year ledger at all, so this can only sum THIS business's own
 * `core.documents` sales invoices (`doc_type = 'invoice'`) for the trailing 365 days
 * ending `asOf` (defaults to today).
 *
 * Named limitation, not silently smoothed over (backlog rule 12: distinguish a calculated
 * result from a regulatory fact) -- `getEinvoiceEligibility`'s own result always tags a
 * turnover figure this function produced as `"estimated_from_documents"`, never
 * `"declared"`, so a caller can always tell a real, business-confirmed figure apart from
 * this rough proxy. Read-only, no `requireModule`/`requirePermission` call -- `core.documents`
 * already enforces its own tenant isolation and isn't gated by `gst` licensing, matching
 * every other read-only cross-schema read this module has made since COMPLY-P0-03.1.
 */
export async function estimateTrailingSalesTurnoverInr(businessId: string, asOf?: string): Promise<number> {
  const asOfDate = asOf ? new Date(asOf) : new Date();
  const fromDate = new Date(asOfDate);
  fromDate.setDate(fromDate.getDate() - 365);

  const core = await coreClient();
  const { data, error } = await core
    .from("documents")
    .select("total_amount")
    .eq("business_id", businessId)
    .eq("doc_type", "invoice")
    .gte("doc_date", fromDate.toISOString().slice(0, 10))
    .lte("doc_date", asOfDate.toISOString().slice(0, 10));
  if (error) throw error;

  return sumInvoiceTotals((data ?? []).map((row) => ({ totalAmount: row.total_amount })));
}
