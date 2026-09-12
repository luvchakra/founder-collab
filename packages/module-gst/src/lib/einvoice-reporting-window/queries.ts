import { getDocumentContext } from "../core-transactions/queries";
import { estimateTrailingSalesTurnoverInr } from "../einvoice-eligibility/turnover";
import { getEffectiveEinvoiceReportingWindow } from "./rule";
import { determineEinvoiceReportingDeadline } from "./determine";
import type { EinvoiceReportingDeadlineResult } from "./determine";

export type EinvoiceReportingDeadlineInput = {
  /** Evaluate as of this moment instead of today -- pass the e-invoice's own actual
   * generation timestamp (e.g. `gst.einvoices.created_at`) to check historically whether
   * it made its deadline. */
  asOf?: string;
  /** A caller-declared (business-confirmed) aggregate turnover figure, if known -- takes
   * priority over this module's own rough `core.documents`-based estimate, same
   * convention as COMPLY-P0-05.1's own `EinvoiceEligibilityInput`. */
  aggregateTurnoverInr?: number;
};

/**
 * COMPLY-P0-05.5 (Reporting Deadline Control): the orchestrator -- reads the document's
 * own invoice date (COMPLY-P0-03.1), the reporting-window rule in effect as of `asOf`
 * (this story's own versioned `gst.tax_rules` lineage), and either the caller-supplied
 * turnover or COMPLY-P0-05.1's own rough document-based estimate, then hands everything to
 * the pure `determineEinvoiceReportingDeadline`.
 *
 * Returns `null` when the document itself doesn't exist for this business -- "nothing to
 * evaluate," matching every other document-keyed orchestrator in this module
 * (`getGstInvoiceValidation`, `getEinvoiceSchemaValidation`).
 */
export async function getEinvoiceReportingDeadline(
  businessId: string,
  documentId: string,
  input: EinvoiceReportingDeadlineInput = {},
): Promise<EinvoiceReportingDeadlineResult | null> {
  const document = await getDocumentContext(businessId, documentId);
  if (!document) return null;

  const [rule, turnoverInr] = await Promise.all([
    getEffectiveEinvoiceReportingWindow(input.asOf),
    typeof input.aggregateTurnoverInr === "number"
      ? Promise.resolve(input.aggregateTurnoverInr)
      : estimateTrailingSalesTurnoverInr(businessId, input.asOf),
  ]);

  return determineEinvoiceReportingDeadline({
    invoiceDate: document.docDate,
    asOf: input.asOf,
    aggregateTurnoverInr: turnoverInr,
    aatoThresholdInr: rule?.aatoThresholdInr ?? null,
    windowDays: rule?.windowDays ?? null,
    rule: rule?.rule ?? null,
  });
}
