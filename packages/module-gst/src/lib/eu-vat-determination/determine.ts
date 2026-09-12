import { isEuMemberState } from "../compliance/eu";
import type { EuVatDetermineInput, EuVatDetermineResult } from "./types";

/**
 * COMPLY-P1-01.3 (Intra-EU VAT) / COMPLY-P1-01.4 (OSS/IOSS): the qualitative treatment
 * decision for one EU-established seller's own outward supply -- domestic, intra-EU B2B
 * (reverse charge), intra-EU B2C (origin- or destination-rated, depending on the OSS
 * threshold), or export outside the EU. Pure, synchronous, no DB access -- the same shape
 * `lib/place-of-supply/determine.ts` already established for India: every regulatory FACT
 * this function needs (which countries are in the EU, the OSS threshold) is resolved by a
 * caller first and passed in, never looked up or hard-coded here.
 *
 * Deliberately does NOT compute an actual tax amount or split (unlike India's own
 * `determineGstLineTax`, which calls `computeLineGst` for a real CGST/SGST/IGST breakup) --
 * EU VAT has no equivalent multi-component split to compute; the numeric rate itself comes
 * from `lib/tax-rules/eu-vat-rates.ts`'s own `getEffectiveEuVatStandardRate(rateCountry)`
 * once this function says WHICH country's rate applies. Wiring this into a real invoice
 * line (an EU equivalent of COMPLY-P0-04.5) is left to whichever future story actually
 * builds EU invoicing on top of `core.documents` -- no such consumer exists yet for any of
 * this build's five EU country packs (backlog rule 5, "don't implement future stories
 * implicitly").
 */
export function determineEuVatTreatment(input: EuVatDetermineInput): EuVatDetermineResult {
  const zero: Pick<EuVatDetermineResult, "treatment" | "rateCountry"> = { treatment: null, rateCountry: null };

  if (!isEuMemberState(input.sellerCountry)) {
    return {
      ...zero,
      placeOfSupply: "unknown",
      reason: `${input.sellerCountry} is not an EU member state -- this function only determines EU VAT treatment for an EU-established seller.`,
      incomplete: true,
    };
  }

  if (input.sellerCountry === input.buyerCountry) {
    return {
      treatment: "standard",
      placeOfSupply: "domestic",
      rateCountry: input.sellerCountry,
      reason: `Domestic supply within ${input.sellerCountry} -- taxed at ${input.sellerCountry}'s own VAT rate.`,
      incomplete: false,
    };
  }

  if (!isEuMemberState(input.buyerCountry)) {
    return {
      treatment: "export",
      placeOfSupply: "export",
      rateCountry: null,
      reason: `Export outside the EU (buyer in ${input.buyerCountry}) -- zero-rated on the seller's own invoice.`,
      incomplete: false,
    };
  }

  // Both parties are EU member states, but different ones -- intra-EU.
  if (input.buyerVatIdValidated) {
    return {
      treatment: "reverse_charge",
      placeOfSupply: "intra_eu_b2b",
      rateCountry: null,
      reason: `Intra-EU B2B supply (seller ${input.sellerCountry}, buyer ${input.buyerCountry} with a validated VAT ID) -- the buyer self-accounts for VAT under the reverse charge; no VAT is charged on this invoice.`,
      incomplete: false,
    };
  }

  // B2C intra-EU distance sale -- origin- vs destination-rated depends on the EU-wide OSS
  // threshold (COMPLY-P1-01.4), never guessed without a real cumulative-sales figure AND a
  // real resolved threshold -- checked in the order a caller can most usefully act on
  // (the cumulative figure is THEIR OWN declared fact; the threshold is a regulatory rule
  // that failed to resolve, a more surprising gap worth its own distinct reason).
  if (input.cumulativeEuDistanceSalesEur == null) {
    return {
      ...zero,
      placeOfSupply: "unknown",
      reason: "Cannot determine origin- vs destination-country VAT rate for this intra-EU B2C sale without a declared cumulative EU distance-sales figure for the year.",
      incomplete: true,
    };
  }

  if (input.ossThresholdEur == null) {
    return {
      ...zero,
      placeOfSupply: "unknown",
      reason: "No OSS distance-selling threshold could be resolved for this date -- cannot determine origin- vs destination-country VAT rate for this intra-EU B2C sale.",
      incomplete: true,
    };
  }

  if (input.cumulativeEuDistanceSalesEur <= input.ossThresholdEur) {
    return {
      treatment: "standard",
      placeOfSupply: "intra_eu_b2c_origin",
      rateCountry: input.sellerCountry,
      reason: `Intra-EU B2C sale below the EUR ${input.ossThresholdEur} pan-EU distance-selling threshold (cumulative EUR ${input.cumulativeEuDistanceSalesEur} so far) -- taxed at the seller's own ${input.sellerCountry} VAT rate.`,
      incomplete: false,
    };
  }

  return {
    treatment: "standard",
    placeOfSupply: "intra_eu_b2c_destination",
    rateCountry: input.buyerCountry,
    reason: `Intra-EU B2C sale above the EUR ${input.ossThresholdEur} pan-EU distance-selling threshold (cumulative EUR ${input.cumulativeEuDistanceSalesEur}) -- taxed at the buyer's own ${input.buyerCountry} VAT rate; reportable via OSS.`,
    incomplete: false,
  };
}
