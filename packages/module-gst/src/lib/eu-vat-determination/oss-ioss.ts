import { EU_WIDE_RULE_COUNTRY } from "../compliance/eu";
import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";

/** COMPLY-P1-01.4 (OSS/IOSS): lineage identifiers + parsers for the two pan-EU threshold
 * rules `20260912250000_gst_tax_rules_eu_oss_ioss_thresholds_seed.sql` published -- same
 * "opaque jsonb, defensive parse, never guess" shape as `eu-vat-rates.ts`/
 * `india-rate-slabs.ts`. */

export const OSS_DISTANCE_SELLING_THRESHOLD_RULE: TaxRuleLineage = {
  country: EU_WIDE_RULE_COUNTRY,
  jurisdiction: null,
  regime: "VAT",
  ruleKey: "oss_distance_selling_threshold_eur",
};

export const IOSS_CONSIGNMENT_VALUE_THRESHOLD_RULE: TaxRuleLineage = {
  country: EU_WIDE_RULE_COUNTRY,
  jurisdiction: null,
  regime: "VAT",
  ruleKey: "ioss_consignment_value_threshold_eur",
};

export type EuThresholdValue = { thresholdEur: number; appliesTo: string; label: string };

export function parseEuThresholdValue(value: Record<string, unknown>): EuThresholdValue | null {
  const thresholdEur = value.thresholdEur;
  if (typeof thresholdEur !== "number" || !Number.isFinite(thresholdEur)) return null;
  const appliesTo = typeof value.appliesTo === "string" ? value.appliesTo : "";
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "EU threshold";
  return { thresholdEur, appliesTo, label };
}

/** The OSS distance-selling threshold in effect as of `asOf` (defaults to today), or
 * `null` when no version covers that date or the value doesn't parse -- callers (e.g. a
 * future orchestrator wiring `determineEuVatTreatment` into a real sale) must treat `null`
 * as "cannot determine origin vs destination rate," never fall back to a guessed EUR
 * 10,000 constant hard-coded a second time. */
export async function getEffectiveOssThreshold(asOf?: string): Promise<(EuThresholdValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(OSS_DISTANCE_SELLING_THRESHOLD_RULE, asOf);
  if (!rule) return null;
  const parsed = parseEuThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

/** The IOSS consignment-value threshold in effect as of `asOf` -- same shape/posture as
 * `getEffectiveOssThreshold`. No consumer in this build applies it yet (see the seed
 * migration's own comment); published so a future import-side story doesn't need its own
 * migration to add the fact this one already sourced. */
export async function getEffectiveIossThreshold(asOf?: string): Promise<(EuThresholdValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(IOSS_CONSIGNMENT_VALUE_THRESHOLD_RULE, asOf);
  if (!rule) return null;
  const parsed = parseEuThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
