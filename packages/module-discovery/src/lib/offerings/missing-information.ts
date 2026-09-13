import type { IcpProfile } from "../icp/types";
import type { BuyerPersona } from "../personas/types";

/**
 * DISC-OFFER-P1-03.2: "Missing Information Suggestions" -- the doc's own worked example
 * ("We understand what you sell. / We are less certain about: - Ideal customer size -
 * Primary buyer - Geographic focus"). Distinct from DISC-OFFER-P1-03.1's own five broad
 * dimensions (Description/Target Customer/ICP Evidence/Buyer Evidence/Differentiation):
 * this story's own worked example names specific, individually-actionable ICP fields,
 * not a dimension-level Strong/Medium/Weak verdict -- a founder can act on "Geographic
 * focus" directly, but not on "Target Customer" as a single undifferentiated thing. Pure
 * and deterministic (CLAUDE.md dev principle #4), and "never manufacture missing
 * information" is structural: every item here corresponds to a real, checkable field
 * that is genuinely empty -- nothing is inferred or guessed about *why* it's empty.
 */
export type MissingInformationItem = {
  /** Machine key, stable across renders -- used as a list key and, if a future story
   * needs it, a way to link straight to the one field that's missing. */
  field: "target_industries" | "customer_size" | "geographic_focus" | "primary_buyer";
  /** The doc's own literal wording where it gives one (customer size/primary buyer/
   * geographic focus); a matching label for the one field the doc doesn't happen to
   * name in its own three-item example. */
  label: string;
};

const MISSING_INFORMATION_LABEL: Record<MissingInformationItem["field"], string> = {
  target_industries: "Target industries",
  customer_size: "Ideal customer size",
  geographic_focus: "Geographic focus",
  primary_buyer: "Primary buyer",
};

/**
 * `primary_buyer` is genuinely known if *either* the ICP names buyer roles or a real
 * buyer persona has been defined -- these are two different ways of recording the same
 * underlying fact (DISC-OFFER-P0-02.3's own persona is a richer record of the same
 * "who buys this" question `icp.roles` answers more loosely), so having one is enough
 * evidence not to flag this as missing.
 */
export function identifyMissingOfferingInformation(input: { icp: IcpProfile | null; personas: BuyerPersona[] }): MissingInformationItem[] {
  const { icp, personas } = input;
  const missing: MissingInformationItem["field"][] = [];

  if (!icp || icp.industries.length === 0) missing.push("target_industries");
  if (!icp || icp.company_sizes.length === 0) missing.push("customer_size");
  if (!icp || icp.geographies.length === 0) missing.push("geographic_focus");
  if ((!icp || icp.roles.length === 0) && personas.length === 0) missing.push("primary_buyer");

  return missing.map((field) => ({ field, label: MISSING_INFORMATION_LABEL[field] }));
}
