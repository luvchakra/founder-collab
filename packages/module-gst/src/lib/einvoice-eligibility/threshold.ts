import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P0-05.1 (E-Invoice Eligibility): "Determine obligation using active rules." The
 * lineage identifier for the versioned aggregate-turnover threshold that actually decides
 * whether a business is obligated to generate e-invoices at all -- seeded by
 * `20260912010000_gst_tax_rules_einvoice_threshold_seed.sql` (₹10 crore from
 * 01-Oct-2022, ₹5 crore from 01-Aug-2023 -- see that migration's own comment for full
 * sourcing). Same "export the lineage as a constant" convention COMPLY-P0-04.7's own
 * `india-rate-slabs.ts` already established for `INDIA_GST_RATE_SLABS_RULE`.
 */
export const EINVOICE_TURNOVER_THRESHOLD_RULE: TaxRuleLineage = {
  country: "IN",
  regime: "GST",
  jurisdiction: null,
  ruleKey: "einvoice_turnover_threshold_inr",
};

export type EinvoiceThresholdValue = {
  thresholdInr: number;
  label: string;
};

/**
 * Defensive parse of `gst.tax_rules.value` for this specific rule_key -- same "opaque
 * jsonb, never assume its shape" posture `india-rate-slabs.ts`'s own
 * `parseRateSlabValue` already established. Returns `null` for anything malformed, which a
 * caller treats the same as "no rule found."
 */
export function parseEinvoiceThresholdValue(value: Record<string, unknown>): EinvoiceThresholdValue | null {
  const thresholdInr = value.thresholdInr;
  if (typeof thresholdInr !== "number" || !Number.isFinite(thresholdInr) || thresholdInr <= 0) return null;

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "e-Invoice turnover threshold";
  return { thresholdInr, label };
}

/**
 * The e-invoice turnover threshold in effect as of `asOf` (defaults to today) -- `null`
 * when no version covers that date, or the stored value doesn't parse. Never guesses a
 * fallback threshold. Same "unknown, don't assume" posture as
 * `india-rate-slabs.ts`'s own `getEffectiveIndiaGstRateSlabs`.
 */
export async function getEffectiveEinvoiceThreshold(
  asOf?: string,
): Promise<(EinvoiceThresholdValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(EINVOICE_TURNOVER_THRESHOLD_RULE, asOf);
  if (!rule) return null;
  const parsed = parseEinvoiceThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
