import { computeLineGst } from "@cofounderai/core/lib/gst";
import type { PlaceOfSupplyResult } from "../place-of-supply/types";
import type { GstLineTaxResult } from "./types";

/**
 * COMPLY-P0-04.5 (GST Tax Determination). Reuses (never re-derives) two pieces this
 * backlog already built: COMPLY-P0-04.4's `PlaceOfSupplyResult` for the qualitative
 * category, and `core/lib/gst.ts`'s existing `computeLineGst` for the actual CGST/SGST-
 * vs-IGST arithmetic on a standard-rated domestic line -- that function is already used
 * by `module-inventory`/`module-fsm`'s own live invoicing today, so re-implementing the
 * same half-rate/rounding math here would be exactly the "don't duplicate deterministic
 * logic" this platform's own development principles forbid.
 *
 * **UTGST and cess, named in the backlog's own story title, are deliberately NOT modeled
 * as separate fields here** -- this is a pre-existing platform limitation, not a new gap
 * this story introduces. `core/lib/gst.ts`'s own `GstBreakup` (used by every live
 * inventory/FSM invoice today) only has cgst/sgst/igst; it does not distinguish a Union
 * Territory's UTGST from a state's SGST (this module-gst's own `INDIAN_STATES` catalog,
 * reused from `core`, already lists UTs like Chandigarh/Lakshadweep/Ladakh alongside
 * states without a UTGST/SGST distinction either), and no cess rate exists anywhere in
 * this platform's data model (`core.items.tax_rate`/`core.tax_rates` hold only the base
 * GST slab). Adding either is a `core`-schema change to a type/table several other
 * modules already depend on -- a bigger step than this story's own "read/reuse what
 * exists" scope, and out of place in a run restricted to `module-gst`. Flagged here as a
 * named, concrete gap rather than silently ignored.
 */
export function determineGstLineTax(input: {
  taxableValue: number;
  itemTaxRatePercent: number;
  placeOfSupply: PlaceOfSupplyResult;
  sellerStateCode: string | null;
  buyerStateCode: string | null;
  /** Whether the RECIPIENT, not the supplier, is liable for this supply's GST under
   * Section 9(3)/9(4)-style reverse-charge rules. This module has no notified-goods/
   * services list or unregistered-supplier tracking to derive this from -- it is a
   * caller-DECLARED fact (backlog rule 12), the same "self-declared, not computed"
   * posture COMPLY-P0-04.2's `eInvoiceEligible` flag already takes. */
  reverseCharge: boolean;
}): GstLineTaxResult {
  const zeroBreakup = { cgstRate: 0, sgstRate: 0, igstRate: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalTax: 0 };

  if (input.placeOfSupply.treatment === "unknown") {
    return {
      treatment: null,
      reason: input.placeOfSupply.reason ?? "Place of supply could not be determined.",
      placeOfSupply: "unknown",
      ...zeroBreakup,
      incomplete: true,
    };
  }

  if (input.placeOfSupply.treatment === "export") {
    // Exports under LUT are zero-rated on the invoice itself -- the common India GST
    // default; a bond-based (non-LUT) export, which DOES charge IGST for later refund, is
    // a business-specific election this generic function has no way to know about and
    // does not attempt to guess.
    return { treatment: "export", placeOfSupply: "export", ...zeroBreakup, incomplete: false };
  }

  if (input.reverseCharge) {
    // Under reverse charge the supplier's own invoice carries no tax charge -- the
    // recipient self-assesses separately, outside this line's own amounts.
    return { treatment: "reverse_charge", placeOfSupply: input.placeOfSupply.treatment, ...zeroBreakup, incomplete: false };
  }

  if (input.itemTaxRatePercent === 0) {
    // A 0% item rate is treated as zero-rated rather than "exempt" -- this platform has no
    // separate exempt-vs-zero-rated flag on `core.items` (just a numeric `tax_rate`), so
    // this is a deliberate, named simplification: an item's own rate of exactly 0% reads
    // as zero-rated (ITC on related purchases typically still recoverable) rather than
    // exempt (typically not) until a real per-item exemption flag exists to distinguish
    // the two -- a `core`-schema decision beyond this story's own scope.
    return { treatment: "zero_rated", placeOfSupply: input.placeOfSupply.treatment, ...zeroBreakup, incomplete: false };
  }

  const breakup = computeLineGst({
    taxableValue: input.taxableValue,
    gstRatePercent: input.itemTaxRatePercent,
    sellerStateCode: input.sellerStateCode,
    buyerStateCode: input.buyerStateCode,
  });

  if (breakup.incomplete) {
    // Defensive, not expected in practice: `input.placeOfSupply` already resolved
    // intra/inter using these exact same two state codes, so this branch would only fire
    // if a caller passed a `placeOfSupply` that didn't actually come from
    // `determinePlaceOfSupply({ sellerStateCode, buyerStateCode, ... })` with these codes.
    return {
      treatment: null,
      reason: "Seller or buyer state could not be resolved for the tax split.",
      placeOfSupply: input.placeOfSupply.treatment,
      ...zeroBreakup,
      incomplete: true,
    };
  }

  return {
    treatment: "standard",
    placeOfSupply: input.placeOfSupply.treatment,
    cgstRate: breakup.cgstRate,
    sgstRate: breakup.sgstRate,
    igstRate: breakup.igstRate,
    cgstAmount: breakup.cgstAmount,
    sgstAmount: breakup.sgstAmount,
    igstAmount: breakup.igstAmount,
    totalTax: breakup.totalTax,
    incomplete: false,
  };
}
