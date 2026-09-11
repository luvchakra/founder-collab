import { resolveStateCode } from "@cofounderai/core/lib/gst";
import { getPrimaryTaxRegistration } from "../tax-registrations/queries";
import { getPartyTaxContext } from "../party-tax-context/queries";
import type { PartyAddress, PartyTaxContext } from "../party-tax-context/types";
import { determinePlaceOfSupply } from "./determine";
import type { PlaceOfSupplyResult } from "./types";

/**
 * COMPLY-P0-04.4 (Place of Supply): ties together this epic's own existing reads --
 * COMPLY-P0-04.1's `getPrimaryTaxRegistration` (the supplying business's own state) and
 * COMPLY-P0-03.4's `getPartyTaxContext` (the buyer's tax identity/addresses) -- into the
 * one thing a caller actually wants: "what's the place-of-supply treatment for a supply
 * to this party." India/GST-only by construction (hard-codes `country: "IN", regime:
 * "GST"` into the registration lookup), matching this epic's own scope; a P1 country pack
 * would need its own version of this orchestrator for its own regime's place-of-supply
 * rules, not a generalization of this one guessed at now.
 *
 * The buyer's own "location" for this purpose prefers the shipping address, falling back
 * to billing, then to the tax identity's own `state` field alone -- a reasonable default
 * (goods normally move to the shipping address; a party with no addresses on file at all
 * might still have a GSTIN/state recorded), not a full implementation of GST's own
 * services-vs-goods, bill-to/ship-to place-of-supply sub-rules for every scenario. Real
 * transaction data may well surface a case this simplification gets wrong (e.g. services
 * billed to one state but consumed in another) -- refining this is COMPLY-P0-04.5's own
 * job once a real GST Tax Determination story needs the nuance, not something to guess at
 * speculatively here.
 */
export function chooseBuyerAddress(context: PartyTaxContext): PartyAddress | null {
  return context.shippingAddress ?? context.billingAddress ?? null;
}

export type SupplyStateCodes = {
  sellerStateCode: string | null;
  buyerStateCode: string | null;
  buyerCountry: string | null;
};

/**
 * The raw inputs `determinePlaceOfSupply` needs, resolved once from this epic's own
 * existing reads. Exported (not just used internally by `getPlaceOfSupplyForParty`) so
 * COMPLY-P0-04.5 (GST Tax Determination) can reuse the SAME resolved codes it needs for
 * the actual CGST/SGST-vs-IGST split (`core/lib/gst.ts`'s own `computeLineGst` takes state
 * codes directly) without re-deriving them or duplicating this resolution logic a second
 * time.
 */
export async function resolveSupplyStateCodes(businessId: string, partyId: string): Promise<SupplyStateCodes> {
  const [registration, partyContext] = await Promise.all([
    getPrimaryTaxRegistration(businessId, "IN", "GST"),
    getPartyTaxContext(businessId, partyId),
  ]);

  const sellerStateCode = registration
    ? resolveStateCode(registration.jurisdiction, registration.registration_number)
    : null;

  const buyerAddress = chooseBuyerAddress(partyContext);
  const buyerStateCode = resolveStateCode(
    buyerAddress?.state ?? partyContext.taxIdentity?.state ?? null,
    partyContext.taxIdentity?.gstin ?? null,
  );
  const buyerCountry = buyerAddress?.country ?? null;

  return { sellerStateCode, buyerStateCode, buyerCountry };
}

export async function getPlaceOfSupplyForParty(businessId: string, partyId: string): Promise<PlaceOfSupplyResult> {
  const codes = await resolveSupplyStateCodes(businessId, partyId);
  return determinePlaceOfSupply(codes);
}
