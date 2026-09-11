import type { PlaceOfSupplyResult } from "./types";

/**
 * A known, deliberately narrow set of spellings for "India" a free-text
 * `core.addresses.country` field might actually contain -- that column has no fixed
 * catalog (unlike `jurisdiction`, COMPLY-P0-02.2), so this can't be an exact-match lookup
 * against a canonical list the way `isJurisdictionSupported` is. Treated the same way as
 * every other free-text-but-important field in this module: normalize and compare, but
 * never guess when the value is genuinely absent.
 */
const INDIA_COUNTRY_ALIASES = new Set(["india", "in", "bharat"]);

/**
 * `true`/`false` when a country value clearly does or doesn't mean India, `null` when the
 * field is empty/unset -- distinct from "false", since an unset country is NOT evidence of
 * an export (most domestic addresses in this platform never bother filling the country
 * field at all), it's simply unknown.
 */
export function isIndiaCountry(country: string | null | undefined): boolean | null {
  if (!country || !country.trim()) return null;
  return INDIA_COUNTRY_ALIASES.has(country.trim().toLowerCase());
}

/**
 * Classifies a supply from its seller/buyer state codes and the buyer's country.
 *
 * A buyer country that clearly isn't India wins outright ("export") regardless of state
 * codes -- an export has no "state" to compare in the first place. An empty/unknown
 * country does NOT default to "assume domestic": it falls through to the state-code
 * comparison exactly as `computeLineGst` already does today, so this function stays a
 * backward-compatible superset of that existing behavior rather than a new risky
 * assumption -- when country is unknown, the only thing this function adds beyond
 * `computeLineGst` is a "known which categories exist" label, not a new default.
 *
 * "Special treatment" (the backlog's own words) covers SEZ supplies under India GST, which
 * are zero-rated similarly to exports -- deliberately NOT modeled as its own category here.
 * No field anywhere in this platform records whether a party is an SEZ unit/developer
 * (`core.tax_identities`/`core.parties` have no such column), and adding one is a `core`
 * schema decision bigger than this story's own "read what already exists" scope -- flagged
 * as a concrete, named gap for a future story once that data model decision is made, not
 * silently absorbed into "export" (which would misrepresent a domestic SEZ supply as a
 * cross-border one) or "inter_state" (which would miss that it's zero-rated at all).
 */
export function determinePlaceOfSupply(input: {
  sellerStateCode: string | null;
  buyerStateCode: string | null;
  buyerCountry: string | null;
}): PlaceOfSupplyResult {
  if (isIndiaCountry(input.buyerCountry) === false) {
    return { treatment: "export" };
  }

  if (!input.sellerStateCode || !input.buyerStateCode) {
    return {
      treatment: "unknown",
      reason: !input.sellerStateCode
        ? "The supplying business's own registered state could not be resolved."
        : "The buyer's state could not be resolved.",
    };
  }

  return { treatment: input.sellerStateCode === input.buyerStateCode ? "intra_state" : "inter_state" };
}
