import type { SgSupplyClassification } from "./types";

/**
 * COMPLY-P1-04.2 (GST F5): Singapore has no sub-national place-of-supply concept (one
 * nationwide GST rate, `lib/compliance/jurisdictions.ts` has no `SG` entry) -- the one
 * classification this return preparer actually needs is domestic vs. cross-border, the
 * same "buyer country resolved by the caller, classify from it" shape
 * `determineCaPlaceOfSupply`'s own `treatment` half already established, minus the
 * province-resolution half Canada needs and Singapore does not.
 *
 * A buyer in Singapore is `"domestic"` (standard-rated, absent some other exemption this
 * function does not classify -- see `queries.ts`'s own `notModeled`). A buyer outside
 * Singapore is `"export"` -- IRAS zero-rates most exported goods and international
 * services (a real, source-cited fact `lib/compliance/treatments.ts`'s own `zero_rated`
 * treatment code already covers; this function only classifies, the versioned rate rule
 * simply is not applied for a zero-rated line). An unresolvable buyer country falls
 * through to `"unknown"` rather than guessing domestic -- the same "never default to
 * domestic" discipline `determineCaPlaceOfSupply`/`determinePlaceOfSupply` (India) already
 * established.
 */
export function classifySgSupply(buyerCountry: string | null): SgSupplyClassification {
  if (buyerCountry == null || buyerCountry.trim() === "") return { treatment: "unknown" };

  const isSingapore = /^(singapore|sg)$/i.test(buyerCountry.trim());
  return { treatment: isSingapore ? "domestic" : "export" };
}
