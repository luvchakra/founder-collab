import { getDocumentContext } from "../core-transactions/queries";
import { getGstInvoiceValidation } from "../gst-invoice-validation/queries";
import { getPrimaryTaxRegistration } from "../tax-registrations/queries";
import { getPartyTaxIdentity } from "../party-tax-context/queries";
import { getPlaceOfSupplyForParty } from "../place-of-supply/queries";
import { validateEinvoiceSchemaFields } from "./validate";
import type { EinvoiceSchemaValidationResult } from "./types";

/**
 * COMPLY-P0-05.2 (Schema Validation): the orchestrator -- runs COMPLY-P0-04.6's own
 * generic `getGstInvoiceValidation` first (invoice number/date, line HSN/SAC, place of
 * supply, tax-split consistency), then resolves the two e-invoice-specific facts this
 * story's own `validateEinvoiceSchemaFields` needs on top of that: the business's primary
 * India GST registration (COMPLY-P0-04.1, for the seller GSTIN) and the document's own
 * party's tax identity (COMPLY-P0-03.4, for the buyer GSTIN) plus place of supply
 * (COMPLY-P0-04.4, to know whether a buyer GSTIN is even required for this supply).
 *
 * Returns `null` when the document itself doesn't exist for this business -- "nothing to
 * validate," matching `getGstInvoiceValidation`'s own convention exactly.
 */
export async function getEinvoiceSchemaValidation(
  businessId: string,
  documentId: string,
): Promise<EinvoiceSchemaValidationResult | null> {
  const document = await getDocumentContext(businessId, documentId);
  if (!document) return null;

  const [invoiceValidation, registration, buyerTaxIdentity, placeOfSupply] = await Promise.all([
    getGstInvoiceValidation(businessId, documentId),
    getPrimaryTaxRegistration(businessId, "IN", "GST"),
    getPartyTaxIdentity(businessId, document.partyId),
    getPlaceOfSupplyForParty(businessId, document.partyId),
  ]);

  // `invoiceValidation` cannot actually be `null` here -- `getGstInvoiceValidation` only
  // returns `null` when the document itself doesn't exist, which the guard above already
  // ruled out for the same `businessId`/`documentId` pair. Guarded anyway rather than
  // asserted, so a future change to either function's own "document not found" logic
  // can't silently produce a runtime crash here.
  if (!invoiceValidation) return null;

  return validateEinvoiceSchemaFields({
    invoiceValidation,
    sellerGstin: registration?.registration_number ?? null,
    buyerGstin: buyerTaxIdentity?.gstin ?? null,
    buyerGstinKnown: buyerTaxIdentity !== null,
    placeOfSupply: placeOfSupply.treatment,
  });
}
