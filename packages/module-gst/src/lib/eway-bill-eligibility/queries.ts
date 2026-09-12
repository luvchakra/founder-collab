import { getDocumentContext } from "../core-transactions/queries";
import { getEffectiveEwayBillThreshold } from "./threshold";
import { determineEwayBillEligibility } from "./determine";
import type { EwayBillEligibilityResult } from "./types";

export type EwayBillEligibilityInput = {
  /** Determine eligibility as of this date instead of today -- resolves whichever
   * threshold rule version was actually in effect then. */
  asOf?: string;
  /** A caller-declared consignment value, if known -- takes priority over this module's
   * own document-derived figure (the document's own `totalAmount`, tax-inclusive, matching
   * the same field `generateEwayBill`'s own GSP request already sends as `totalValue`). */
  consignmentValueInr?: number;
};

/**
 * COMPLY-P0-06.1 (E-Way Bill Eligibility Engine): the orchestrator -- reads the document's
 * own consignment value (COMPLY-P0-03.1's `getDocumentContext`, defaulting to its
 * tax-inclusive `totalAmount` unless the caller declares a different figure) and the
 * e-way-bill threshold rule in effect as of `asOf` (this story's own versioned
 * `gst.tax_rules` lineage), then hands both to the pure `determineEwayBillEligibility`.
 *
 * Returns `null` when the document itself doesn't exist for this business -- "nothing to
 * evaluate," matching every other document-keyed orchestrator in this module
 * (`getGstInvoiceValidation`, `getEinvoiceReportingDeadline`, `getEinvoiceStatus`).
 */
export async function getEwayBillEligibility(
  businessId: string,
  documentId: string,
  input: EwayBillEligibilityInput = {},
): Promise<EwayBillEligibilityResult | null> {
  const [document, threshold] = await Promise.all([
    getDocumentContext(businessId, documentId),
    getEffectiveEwayBillThreshold(input.asOf),
  ]);
  if (!document) return null;

  const consignmentValueInr = typeof input.consignmentValueInr === "number" ? input.consignmentValueInr : document.totalAmount;

  return determineEwayBillEligibility({
    consignmentValueInr,
    thresholdInr: threshold?.thresholdInr ?? null,
    thresholdRule: threshold?.rule ?? null,
  });
}
