import { recordTaxDetermination } from "../tax-determinations/mutations";
import type { TaxDetermination } from "../tax-determinations/types";
import { getGstLineTaxDetermination, type GstLineTaxDeterminationInput } from "./queries";
import type { GstLineTaxResult } from "./types";

/**
 * COMPLY-P0-04.5 (GST Tax Determination): the actual "compute AND persist" action
 * COMPLY-P0-02.5's own `gst.tax_determinations` migration comment was written waiting for
 * ("COMPLY-P0-04.5's GST Tax Determination, which will actually compute and persist real
 * India GST results"). Wraps `getGstLineTaxDetermination` (the pure-ish computation) with
 * `recordTaxDetermination` (the immutable snapshot write) so a caller gets one function
 * for the common "figure out the tax AND keep a permanent record of it" case, without
 * having to remember to call both separately.
 *
 * Persists even an "incomplete" result (`treatment: null`) -- backlog rule 13 ("preserve
 * historical filing/evidence state") reads as covering this too: "we did not know the
 * place of supply for this line at this moment" is itself a fact worth keeping on record,
 * not something to suppress just because it isn't a clean answer. `taxAmount` for an
 * incomplete result is 0 (no charge could be computed), never a guess.
 *
 * `jurisdiction` on the persisted snapshot is left `null` -- `resolveSupplyStateCodes`
 * only resolves numeric GST STATE CODES ("27"), not the state NAME
 * `recordTaxDetermination`'s own jurisdiction validation expects
 * (`canonicalJurisdictionName` matches against names like "Maharashtra"). Reverse-mapping
 * a code back to a name is a small addition a future story can make once a real caller
 * needs the jurisdiction on this specific snapshot; not invented speculatively here.
 *
 * Returns `null` (persisting nothing) when the underlying item doesn't exist for this
 * business -- same "nothing to tax" case `getGstLineTaxDetermination` itself returns
 * `null` for, not worth a snapshot row either.
 */
export async function recordGstLineTaxDetermination(
  businessId: string,
  source: { sourceModule: string; sourceReference: string },
  input: GstLineTaxDeterminationInput,
): Promise<{ result: GstLineTaxResult; snapshot: TaxDetermination } | null> {
  const result = await getGstLineTaxDetermination(businessId, input);
  if (!result) return null;

  const snapshot = await recordTaxDetermination(businessId, {
    country: "IN",
    jurisdiction: null,
    regime: "GST",
    treatment: result.treatment,
    sourceModule: source.sourceModule,
    sourceReference: source.sourceReference,
    taxableAmount: input.taxableValue,
    taxAmount: result.totalTax,
    ruleRefs: [],
  });

  return { result, snapshot };
}
