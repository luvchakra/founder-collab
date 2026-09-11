/**
 * COMPLY-P0-04.4 (Place of Supply): "Determine intra/inter-state/export/special
 * treatment." `core/lib/gst.ts`'s existing `computeLineGst` already splits a KNOWN
 * intra-/inter-state pair into CGST+SGST vs. IGST amounts, but it takes both state codes
 * as given -- it has no notion of "export" at all, and returns a zeroed `incomplete: true`
 * result rather than a named category when a state can't be resolved. This story is the
 * missing layer above that: classifying a supply into one of these categories in the
 * first place, from a business's own registration plus a party's tax identity/address
 * (COMPLY-P0-03.4/04.1's own reads) -- not a duplicate of `computeLineGst`'s own job.
 */
export type PlaceOfSupplyTreatment = "intra_state" | "inter_state" | "export" | "unknown";

export type PlaceOfSupplyResult = {
  treatment: PlaceOfSupplyTreatment;
  /** Present only for "unknown" -- which input couldn't be resolved, so a caller can
   * prompt for the right thing rather than guessing (backlog rule 11: never silently
   * default a treatment when the underlying fact isn't actually known). */
  reason?: string;
};
