import { getEffectiveTaxRule, type TaxRuleLineage } from "./queries";
import type { TaxRule } from "./types";

/**
 * COMPLY-P0-04.7 (GST Rule Versioning): "Rates/treatments never hard-coded permanently."
 * The lineage identifier for the one rule COMPLY-P0-02.3's own migration comment reserved
 * this story to populate -- the set of numeric ad-valorem GST rate slabs recognized as of
 * a given date (0/5/12/18/28% before 22-Sep-2025, 0/5/18/40% from 22-Sep-2025 under the
 * GST 2.0 rate rationalization -- see the seed migration's own comment,
 * `20260912000000_gst_tax_rules_india_rate_slabs_seed.sql`, for the full sourcing).
 * Exported as a constant so no caller re-types the literal `rule_key` string by hand.
 */
export const INDIA_GST_RATE_SLABS_RULE: TaxRuleLineage = {
  country: "IN",
  regime: "GST",
  jurisdiction: null,
  ruleKey: "standard_rate_slabs",
};

export type GstRateSlabRuleValue = {
  slabsPercent: number[];
  label: string;
};

/**
 * Defensive parse of `gst.tax_rules.value` for this specific rule_key -- the column is
 * opaque jsonb at the table level (COMPLY-P0-02.3 left it deliberately unopinionated), so a
 * caller reading it back must not assume its shape without checking. Returns `null` for
 * anything malformed rather than throwing, so a caller can treat "rule content exists but
 * doesn't parse" the same as "no rule found" -- both mean "skip the check, never guess."
 */
export function parseRateSlabValue(value: Record<string, unknown>): GstRateSlabRuleValue | null {
  const slabsRaw = value.slabsPercent;
  if (!Array.isArray(slabsRaw) || slabsRaw.length === 0) return null;

  const slabsPercent: number[] = [];
  for (const entry of slabsRaw) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) return null;
    slabsPercent.push(entry);
  }

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "GST rate slabs";
  return { slabsPercent, label };
}

/**
 * Whether `ratePercent` (e.g. a `core.items.tax_rate` / `core.document_lines.tax_rate`
 * value) is one of the currently-recognized GST ad-valorem slabs. Compares to two decimal
 * places -- both source columns are `numeric(5, 2)` -- so `18` and `18.00` compare equal
 * rather than failing on floating-point representation differences.
 */
export function isKnownGstRateSlab(ratePercent: number, slabsPercent: number[]): boolean {
  return slabsPercent.some((slab) => slab.toFixed(2) === ratePercent.toFixed(2));
}

/**
 * The India GST rate-slab rule in effect as of `asOf` (defaults to today, via
 * `getEffectiveTaxRule`'s own default) -- `null` when no version covers that date (e.g. a
 * date before 1-Jul-2017, before this rule lineage existed at all) or when the stored
 * value doesn't parse. Never guesses a fallback slab list. Callers (e.g.
 * `gst-invoice-validation`) treat `null` as "skip the rate-slab check for this document,"
 * the same "unknown, don't assume" posture this module has used since COMPLY-P0-03.4's own
 * party tax identity read (`null` there means "no data on file," not "unregistered").
 */
export async function getEffectiveIndiaGstRateSlabs(
  asOf?: string,
): Promise<(GstRateSlabRuleValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(INDIA_GST_RATE_SLABS_RULE, asOf);
  if (!rule) return null;
  const parsed = parseRateSlabValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
