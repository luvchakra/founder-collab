import type { TreatmentCode } from "../compliance/treatments";
import type { PlaceOfSupplyTreatment } from "../place-of-supply/types";

/**
 * COMPLY-P0-04.5 (GST Tax Determination): "CGST/SGST/UTGST/IGST/cess where applicable,
 * reverse charge, exempt/zero-rated/export/SEZ treatment." The result of applying every
 * piece this epic has built so far (place of supply, a party's tax identity, an item's own
 * tax rate, a caller-declared reverse-charge flag) to one line.
 *
 * `treatment: null` means "could not be determined" (`incomplete: true`) -- never defaulted
 * to "standard" when the underlying facts (most often place of supply) aren't actually
 * known, per backlog rule 11's "never claim compliant from a calculation alone."
 *
 * UTGST and cess are named in the backlog's own story title but deliberately not modeled
 * as separate fields here -- see `determine.ts`'s own docstring for why.
 */
export type GstLineTaxResult = {
  treatment: TreatmentCode | null;
  /** Present only when `treatment` is `null` -- which fact couldn't be resolved. */
  reason?: string;
  placeOfSupply: PlaceOfSupplyTreatment;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  incomplete: boolean;
};
