import { isValidGstin } from "@cofounderai/core/lib/gst";
import type { OutwardSupplyDocument } from "../shared/types";

export type Gstr3bOutwardClassification = "taxable_other" | "zero_rated" | "excluded_unknown_place_of_supply";

/**
 * COMPLY-P0-07.2 (GSTR-3B Preparation): Table 3.1's own top-level split -- an export has
 * no domestic tax to report against (Table 3.1(b), zero-rated), an unresolved place of
 * supply is a genuine data gap (excluded, never silently assumed domestic -- backlog rule
 * 11, same posture COMPLY-P0-07.1's own `classifyGstr1Document` already takes), and every
 * other outward document (B2B, B2C large or small, intra- or inter-state alike) is Table
 * 3.1(a) -- unlike GSTR-1, Table 3.1(a) does NOT distinguish registered from unregistered
 * recipients; it's one combined "taxable supplies (other than zero-rated, nil-rated, and
 * exempted)" total.
 */
export function classifyGstr3bOutwardDocument(placeOfSupply: OutwardSupplyDocument["placeOfSupply"]): Gstr3bOutwardClassification {
  if (placeOfSupply === "export") return "zero_rated";
  if (placeOfSupply === "unknown") return "excluded_unknown_place_of_supply";
  return "taxable_other";
}

export type Gstr3bInterStateBucket = "unregistered" | "composition" | "not_applicable";

/**
 * Table 3.2's own recipient-type split -- ONLY meaningful for an inter-state supply
 * (Table 3.2 doesn't exist for intra-state supplies at all, hence `"not_applicable"` for
 * anything that isn't `placeOfSupply === "inter_state"`). A recipient with a valid,
 * registered GSTIN who is NOT specifically a composition dealer is a regular registered
 * recipient -- Table 3.2 has no column for that at all (it's already counted in Table
 * 3.1(a) and needs no separate state-wise breakout), so `"not_applicable"` covers that case
 * too. Everything else (no GSTIN on file, an invalid/unparseable GSTIN, or an explicit
 * `"unregistered"` registration type) is treated as unregistered -- the same "invalid GSTIN
 * behaves as unregistered" convention `classifyGstr1Document` already established.
 */
export function classifyGstr3bInterStateBucket(input: {
  placeOfSupply: OutwardSupplyDocument["placeOfSupply"];
  gstin: string | null;
  gstRegistrationType: OutwardSupplyDocument["gstRegistrationType"];
}): Gstr3bInterStateBucket {
  if (input.placeOfSupply !== "inter_state") return "not_applicable";
  if (input.gstRegistrationType === "composition") return "composition";

  const hasValidRegisteredGstin = !!input.gstin && isValidGstin(input.gstin);
  if (hasValidRegisteredGstin) return "not_applicable";

  return "unregistered";
}
