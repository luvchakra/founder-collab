import { resolveSupplyStateCodes } from "../place-of-supply/queries";
import { determinePlaceOfSupply } from "../place-of-supply/determine";
import { getItemTaxContext } from "../inventory-tax-context/queries";
import { determineGstLineTax } from "./determine";
import type { GstLineTaxResult } from "./types";

export type GstLineTaxDeterminationInput = {
  partyId: string;
  itemId: string;
  taxableValue: number;
  /** Defaults to `false` -- see `determine.ts`'s own docstring for why this is a
   * caller-declared input, never inferred. */
  reverseCharge?: boolean;
};

/**
 * COMPLY-P0-04.5 (GST Tax Determination): the read-only "what would the tax be" answer
 * for one line, combining COMPLY-P0-04.4's place-of-supply resolution (reusing
 * `resolveSupplyStateCodes` directly, rather than calling `getPlaceOfSupplyForParty` and
 * re-resolving the same two reads a second time) with COMPLY-P0-03.2's own item tax
 * context (for the item's current `taxRate`) and this story's own `determineGstLineTax`.
 *
 * Returns `null` when the item itself doesn't exist or doesn't belong to `businessId` --
 * distinct from `GstLineTaxResult`'s own `treatment: null` (which means "item exists, but
 * a place-of-supply fact is missing"). A caller should treat a `null` return as "nothing
 * to tax" (e.g. a bad `itemId`), not as an incomplete determination worth persisting.
 */
export async function getGstLineTaxDetermination(
  businessId: string,
  input: GstLineTaxDeterminationInput,
): Promise<GstLineTaxResult | null> {
  const [codes, item] = await Promise.all([
    resolveSupplyStateCodes(businessId, input.partyId),
    getItemTaxContext(businessId, input.itemId),
  ]);
  if (!item) return null;

  const placeOfSupply = determinePlaceOfSupply(codes);

  return determineGstLineTax({
    taxableValue: input.taxableValue,
    itemTaxRatePercent: item.taxRate,
    placeOfSupply,
    sellerStateCode: codes.sellerStateCode,
    buyerStateCode: codes.buyerStateCode,
    reverseCharge: input.reverseCharge ?? false,
  });
}
