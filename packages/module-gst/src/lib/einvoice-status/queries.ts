import { getEinvoiceForDocument } from "../einvoicing/queries";
import { getEinvoiceEligibility } from "../einvoice-eligibility/queries";
import { getEinvoiceReportingDeadline } from "../einvoice-reporting-window/queries";
import { determineEinvoiceStatus } from "./determine";
import type { EinvoiceStatusResult } from "./types";

export type EinvoiceStatusInput = {
  /** Evaluate as of this moment instead of today -- forwarded to both the eligibility and
   * reporting-deadline determinations, same convention those two already establish. */
  asOf?: string;
  /** A caller-declared (business-confirmed) aggregate turnover figure -- forwarded to both
   * sub-determinations so they agree on the same figure instead of each estimating its own
   * (they would otherwise independently call the same rough document-based estimate). */
  aggregateTurnoverInr?: number;
  /** See COMPLY-P0-05.1's own `determineEinvoiceEligibility` docstring -- caller-declared,
   * never inferred. */
  everCrossedThresholdHistorically?: boolean;
};

/**
 * COMPLY-P0-05.6 (E-Invoice Status): the orchestrator -- reads whether a `gst.einvoices`
 * row already exists for this document (COMPLY-P0-05.3/05.4), COMPLY-P0-05.1's own mandate
 * determination, and COMPLY-P0-05.5's own reporting-deadline determination, all three in
 * parallel, then hands the combined facts to the pure `determineEinvoiceStatus`.
 *
 * Returns `null` when the document itself doesn't exist for this business -- "nothing to
 * evaluate," matching every other document-keyed orchestrator in this module
 * (`getGstInvoiceValidation`, `getEinvoiceSchemaValidation`, `getEinvoiceReportingDeadline`
 * itself, whose own `null` is how this function detects a missing document rather than
 * re-checking document existence a second time).
 */
export async function getEinvoiceStatus(
  businessId: string,
  documentId: string,
  input: EinvoiceStatusInput = {},
): Promise<EinvoiceStatusResult | null> {
  const [einvoice, eligibility, deadline] = await Promise.all([
    getEinvoiceForDocument(businessId, documentId),
    getEinvoiceEligibility(businessId, input),
    getEinvoiceReportingDeadline(businessId, documentId, input),
  ]);
  if (deadline === null) return null;

  return determineEinvoiceStatus({
    einvoiceRowStatus: einvoice?.status ?? null,
    mandated: eligibility.mandated,
    deadlineStatus: deadline.status,
  });
}
