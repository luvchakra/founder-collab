import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P0-06.1 (E-Way Bill Eligibility Engine): "Determine whether e-way bill applies."
 * The lineage identifier for the versioned consignment-value threshold that decides
 * whether a movement of goods requires an e-way bill at all -- seeded by
 * `20260912050000_gst_tax_rules_eway_bill_threshold_seed.sql` (₹50,000 from 01-Apr-2018 --
 * see that migration's own comment for full sourcing). Same "export the lineage as a
 * constant" convention COMPLY-P0-05.1's own `EINVOICE_TURNOVER_THRESHOLD_RULE` established.
 */
export const EWAY_BILL_THRESHOLD_RULE: TaxRuleLineage = {
  country: "IN",
  regime: "GST",
  jurisdiction: null,
  ruleKey: "eway_bill_consignment_value_threshold_inr",
};

export type EwayBillThresholdValue = {
  thresholdInr: number;
  label: string;
};

/**
 * Defensive parse of `gst.tax_rules.value` for this specific rule_key -- same "opaque
 * jsonb, never assume its shape" posture every prior rule-value parser in this module
 * already established (`parseRateSlabValue`, `parseEinvoiceThresholdValue`). Returns `null`
 * for anything malformed, which a caller treats the same as "no rule found."
 */
export function parseEwayBillThresholdValue(value: Record<string, unknown>): EwayBillThresholdValue | null {
  const thresholdInr = value.thresholdInr;
  if (typeof thresholdInr !== "number" || !Number.isFinite(thresholdInr) || thresholdInr <= 0) return null;

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "E-Way Bill consignment value threshold";
  return { thresholdInr, label };
}

/**
 * The e-way bill consignment-value threshold in effect as of `asOf` (defaults to today) --
 * `null` when no version covers that date, or the stored value doesn't parse. Never guesses
 * a fallback threshold. Same "unknown, don't assume" posture as
 * `getEffectiveEinvoiceThreshold`.
 */
export async function getEffectiveEwayBillThreshold(
  asOf?: string,
): Promise<(EwayBillThresholdValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(EWAY_BILL_THRESHOLD_RULE, asOf);
  if (!rule) return null;
  const parsed = parseEwayBillThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
