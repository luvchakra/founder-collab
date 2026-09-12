import { getDocumentContext } from "../core-transactions/queries";
import { listItemTaxContexts } from "../inventory-tax-context/queries";
import { getPlaceOfSupplyForParty } from "../place-of-supply/queries";
import { getEffectiveIndiaGstRateSlabs } from "../tax-rules/india-rate-slabs";
import { validateGstInvoiceFields } from "./validate";
import type { GstInvoiceValidationResult } from "./types";

/**
 * COMPLY-P0-04.6 (GST Invoice Validation): the orchestrator -- reads one document
 * (COMPLY-P0-03.1), the current classification of every item its lines reference
 * (COMPLY-P0-03.2, batched in one call via `listItemTaxContexts` rather than one read per
 * line), and the place-of-supply treatment for its party (COMPLY-P0-04.4), then hands all
 * three to the pure `validateGstInvoiceFields`.
 *
 * COMPLY-P0-04.7 (GST Rule Versioning) added a fourth read: the GST rate-slab rule in
 * effect as of the document's OWN invoice date (`document.docDate`, not today) --
 * `getEffectiveTaxRule`'s own versioning already resolves the right slab list for
 * whichever version was live on that date, so an old invoice keeps validating against the
 * slabs that applied when it was issued even after a later rate rationalization
 * supersedes them. `getEffectiveIndiaGstRateSlabs` returns `null` when no rule content
 * covers that date at all -- passed through as `undefined` to `validateGstInvoiceFields`,
 * which skips the rate-slab check entirely rather than treating missing rule content as a
 * finding.
 *
 * Returns `null` when the document itself doesn't exist for this business -- "nothing to
 * validate," not a validation failure of its own.
 *
 * Deliberately generic over `doc_type` -- this does not gate on which document types are
 * "invoice-shaped enough" to need GST validation (that's a business-rule decision for
 * whichever future story actually calls this before a real submission action, e.g.
 * COMPLY-P0-05's e-invoice eligibility/schema validation, not this story's own job to
 * guess at).
 */
export async function getGstInvoiceValidation(
  businessId: string,
  documentId: string,
): Promise<GstInvoiceValidationResult | null> {
  const document = await getDocumentContext(businessId, documentId);
  if (!document) return null;

  const itemIds = [...new Set(document.lines.map((line) => line.itemId))];

  const [items, placeOfSupply, rateSlabs] = await Promise.all([
    listItemTaxContexts(businessId, itemIds),
    getPlaceOfSupplyForParty(businessId, document.partyId),
    getEffectiveIndiaGstRateSlabs(document.docDate),
  ]);

  const lineItemKinds = new Map(items.map((item) => [item.id, item.kind]));

  return validateGstInvoiceFields({
    document,
    lineItemKinds,
    placeOfSupply: placeOfSupply.treatment,
    knownRateSlabsPercent: rateSlabs?.slabsPercent,
  });
}
