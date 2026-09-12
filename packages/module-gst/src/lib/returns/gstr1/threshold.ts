import { getEffectiveTaxRule, type TaxRuleLineage } from "../../tax-rules/queries";
import type { TaxRule } from "../../tax-rules/types";

/**
 * COMPLY-P0-07.1 (GSTR-1 Preparation): the lineage identifier for the versioned
 * invoice-value threshold that decides whether an inter-state supply to an unregistered
 * person must be reported invoice-wise in GSTR-1 Table 5 (B2C Large) rather than netted
 * into Table 7's state-wise B2C Others summary -- seeded by
 * `20260912090000_gst_tax_rules_gstr1_b2c_large_threshold_seed.sql` (₹2,50,000 from
 * GST's own 01-Jul-2017 commencement, ₹1,00,000 from 01-Aug-2024 -- see that migration's
 * own comment for full sourcing). Same "export the lineage as a constant" convention
 * `EINVOICE_TURNOVER_THRESHOLD_RULE`/`EWAY_BILL_THRESHOLD_RULE` already established.
 */
export const GSTR1_B2C_LARGE_THRESHOLD_RULE: TaxRuleLineage = {
  country: "IN",
  regime: "GST",
  jurisdiction: null,
  ruleKey: "gstr1_b2c_large_threshold_inr",
};

export type Gstr1B2cLargeThresholdValue = {
  thresholdInr: number;
  label: string;
};

/**
 * Defensive parse of `gst.tax_rules.value` for this specific rule_key -- same "opaque
 * jsonb, never assume its shape" posture every prior rule-value parser in this module
 * already established (`parseEinvoiceThresholdValue`, `parseEwayBillThresholdValue`).
 * Returns `null` for anything malformed, which a caller treats the same as "no rule
 * found."
 */
export function parseGstr1B2cLargeThresholdValue(value: Record<string, unknown>): Gstr1B2cLargeThresholdValue | null {
  const thresholdInr = value.thresholdInr;
  if (typeof thresholdInr !== "number" || !Number.isFinite(thresholdInr) || thresholdInr <= 0) return null;

  const label =
    typeof value.label === "string" && value.label.trim()
      ? value.label
      : "GSTR-1 B2C Large invoice-wise reporting threshold";
  return { thresholdInr, label };
}

/**
 * The GSTR-1 B2C Large threshold in effect as of `asOf` (defaults to today) -- `null`
 * when no version covers that date, or the stored value doesn't parse. Never guesses a
 * fallback threshold. Same "unknown, don't assume" posture as
 * `getEffectiveEinvoiceThreshold`/`getEffectiveEwayBillThreshold`.
 */
export async function getEffectiveGstr1B2cLargeThreshold(
  asOf?: string,
): Promise<(Gstr1B2cLargeThresholdValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(GSTR1_B2C_LARGE_THRESHOLD_RULE, asOf);
  if (!rule) return null;
  const parsed = parseGstr1B2cLargeThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
