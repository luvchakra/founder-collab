import { getEwayBillEligibility, type EwayBillEligibilityInput } from "../eway-bill-eligibility/queries";
import { getEwayBillMovementContext, type EwayBillMovementContextInput } from "../eway-bill-movement/queries";
import { getEwayBillForDocument } from "../eway-bill/queries";
import { isEwayBillGenerated } from "./link";
import type { EwayBillDocumentLink } from "./types";

export type EwayBillDocumentLinkInput = EwayBillEligibilityInput & EwayBillMovementContextInput;

/**
 * COMPLY-P0-06.4 (Document Link): the combined orchestrator -- reads COMPLY-P0-06.1's own
 * eligibility determination, COMPLY-P0-06.2's own movement-data context, and this
 * document's `gst.eway_bills` generation-history row (if any) in parallel, then reports
 * whether the movement data is now locked (`isEwayBillGenerated`). Returns `null` when the
 * document doesn't exist for this business, matching every other document-keyed
 * orchestrator in this module (`getEwayBillEligibility`, `getGstInvoiceValidation`,
 * `getEinvoiceStatus`).
 *
 * Deliberately does NOT gate or auto-trigger anything (no generation, no blocking) -- this
 * is a read, the same "lib first" posture every other combined read in this epic has taken
 * (COMPLY-P0-05.6's own `getEinvoiceStatus`, COMPLY-P0-06.1's own `getEwayBillEligibility`).
 * A future UI story decides how to present this (e.g. warning when `eligibility.required`
 * is `false`/`null` but a bill was generated anyway, or vice versa) -- this function only
 * assembles the facts, never a verdict.
 */
export async function getEwayBillDocumentLink(
  businessId: string,
  documentId: string,
  input: EwayBillDocumentLinkInput = {},
): Promise<EwayBillDocumentLink | null> {
  const [eligibility, movement, generation] = await Promise.all([
    getEwayBillEligibility(businessId, documentId, input),
    getEwayBillMovementContext(businessId, documentId, input),
    getEwayBillForDocument(businessId, documentId),
  ]);
  if (!eligibility || !movement) return null;

  return { documentId, eligibility, movement, generation, locked: isEwayBillGenerated(generation) };
}
