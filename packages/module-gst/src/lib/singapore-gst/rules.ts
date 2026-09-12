import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import {
  SG_GST_REGIME,
  type ResolvedSgGstProspectiveGracePeriodRule,
  type ResolvedSgGstRegistrationThresholdRule,
  type ResolvedSgGstStandardRateRule,
  type SgGstProspectiveGracePeriodRuleValue,
  type SgGstRegistrationThresholdRuleValue,
  type SgGstStandardRateRuleValue,
} from "./types";

/** COMPLY-P1-04.1/04.2: versioned lookups over the same `gst.tax_rules` engine
 * (COMPLY-P0-02.3) every other country pack in this module already uses. */

export function sgGstStandardRateRule(): TaxRuleLineage {
  return { country: "SG", jurisdiction: null, regime: SG_GST_REGIME, ruleKey: "gst_standard_rate_percent" };
}

export function sgGstRegistrationThresholdRule(): TaxRuleLineage {
  return { country: "SG", jurisdiction: null, regime: SG_GST_REGIME, ruleKey: "gst_registration_threshold_sgd" };
}

export function sgGstProspectiveGracePeriodRule(): TaxRuleLineage {
  return { country: "SG", jurisdiction: null, regime: SG_GST_REGIME, ruleKey: "gst_prospective_registration_grace_period_months" };
}

export function parseSgGstStandardRateValue(value: Record<string, unknown>): SgGstStandardRateRuleValue | null {
  const ratePercent = value.ratePercent;
  if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "GST standard rate";
  return { ratePercent, label };
}

export function parseSgGstRegistrationThresholdValue(value: Record<string, unknown>): SgGstRegistrationThresholdRuleValue | null {
  const thresholdSgd = value.thresholdSgd;
  if (typeof thresholdSgd !== "number" || !Number.isFinite(thresholdSgd)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "GST registration threshold";
  return { thresholdSgd, label };
}

export function parseSgGstProspectiveGracePeriodValue(value: Record<string, unknown>): SgGstProspectiveGracePeriodRuleValue | null {
  const months = value.months;
  if (typeof months !== "number" || !Number.isFinite(months) || months <= 0) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Prospective registration GST-charging grace period";
  return { months, label };
}

export async function getEffectiveSgGstStandardRate(asOf?: string): Promise<ResolvedSgGstStandardRateRule | null> {
  const rule = await getEffectiveTaxRule(sgGstStandardRateRule(), asOf);
  if (!rule) return null;
  const parsed = parseSgGstStandardRateValue(rule.value);
  return parsed ? { ...parsed, rule } : null;
}

export async function getEffectiveSgGstRegistrationThreshold(asOf?: string): Promise<ResolvedSgGstRegistrationThresholdRule | null> {
  const rule = await getEffectiveTaxRule(sgGstRegistrationThresholdRule(), asOf);
  if (!rule) return null;
  const parsed = parseSgGstRegistrationThresholdValue(rule.value);
  return parsed ? { ...parsed, rule } : null;
}

/** `null` when no grace-period rule is in effect as of `asOf` -- a real, correct answer
 * for any date before 1-Jul-2025 (the rule's own `effective_from`), not a parse failure:
 * before that date, no grace period existed at all. Callers treat `null` as "no grace
 * period applies," never as "unknown." */
export async function getEffectiveSgGstProspectiveGracePeriod(asOf?: string): Promise<ResolvedSgGstProspectiveGracePeriodRule | null> {
  const rule = await getEffectiveTaxRule(sgGstProspectiveGracePeriodRule(), asOf);
  if (!rule) return null;
  const parsed = parseSgGstProspectiveGracePeriodValue(rule.value);
  return parsed ? { ...parsed, rule } : null;
}
