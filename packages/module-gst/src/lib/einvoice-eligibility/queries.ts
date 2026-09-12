import { getPrimaryTaxRegistration } from "../tax-registrations/queries";
import { parseGstRegistrationProfile } from "../tax-registrations/gst-registration-profile";
import { getEffectiveEinvoiceThreshold } from "./threshold";
import { estimateTrailingSalesTurnoverInr } from "./turnover";
import { determineEinvoiceEligibility } from "./determine";
import type { EinvoiceEligibilityResult, TurnoverSource } from "./types";

export type EinvoiceEligibilityInput = {
  /** Determine eligibility as of this date instead of today -- resolves whichever
   * threshold rule version was actually in effect then. */
  asOf?: string;
  /** A caller-declared (business-confirmed) aggregate turnover figure, if known -- takes
   * priority over this module's own rough `core.documents`-based estimate when supplied. */
  aggregateTurnoverInr?: number;
  /** See `determine.ts`'s own docstring -- caller-declared, never inferred. */
  everCrossedThresholdHistorically?: boolean;
};

/**
 * COMPLY-P0-05.1 (E-Invoice Eligibility): the orchestrator -- resolves the e-invoice
 * turnover threshold rule in effect as of `asOf` (COMPLY-P0-02.3's own versioned
 * `gst.tax_rules`, seeded by this story's own migration), the business's primary India GST
 * registration for its self-declared `eInvoiceEligible` flag (COMPLY-P0-04.1/04.2), and
 * either the caller-supplied turnover figure or this module's own rough document-based
 * estimate (`estimateTrailingSalesTurnoverInr`) -- then hands all three to the pure
 * `determineEinvoiceEligibility`.
 *
 * Never throws for "nothing to determine" the way some of this module's other
 * orchestrators do (e.g. `getGstLineTaxDetermination` returning `null` for a missing
 * item) -- there is always SOMETHING to say here, even if it's "mandated: null, no rule
 * resolved for this date," so this always returns a real result object.
 */
export async function getEinvoiceEligibility(
  businessId: string,
  input: EinvoiceEligibilityInput = {},
): Promise<EinvoiceEligibilityResult> {
  const [threshold, registration] = await Promise.all([
    getEffectiveEinvoiceThreshold(input.asOf),
    getPrimaryTaxRegistration(businessId, "IN", "GST"),
  ]);

  let turnoverInr: number;
  let turnoverSource: TurnoverSource;
  if (typeof input.aggregateTurnoverInr === "number") {
    turnoverInr = input.aggregateTurnoverInr;
    turnoverSource = "declared";
  } else {
    turnoverInr = await estimateTrailingSalesTurnoverInr(businessId, input.asOf);
    turnoverSource = "estimated_from_documents";
  }

  const selfDeclaredEligible = registration ? parseGstRegistrationProfile(registration.metadata).eInvoiceEligible : null;

  return determineEinvoiceEligibility({
    turnoverInr,
    turnoverSource,
    thresholdInr: threshold?.thresholdInr ?? null,
    thresholdRule: threshold?.rule ?? null,
    everCrossedThresholdHistorically: input.everCrossedThresholdHistorically,
    selfDeclaredEligible,
  });
}
