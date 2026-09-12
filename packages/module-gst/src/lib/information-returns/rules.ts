import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import { US_INFORMATION_RETURNS_REGIME } from "./types";
import type { EfileThresholdRuleValue, Form1099ThresholdRuleValue, ResolvedEfileThresholdRule, ResolvedForm1099ThresholdRule } from "./types";

/** COMPLY-P1-02.8: versioned rule lookups over the same `gst.tax_rules` engine (COMPLY-
 * P0-02.3) every other regime in this module already uses. Both lineages are national
 * (`jurisdiction: null` -- 1099 reporting is a federal, not state, obligation). */

export function form1099ThresholdRule(): TaxRuleLineage {
  return { country: "US", jurisdiction: null, regime: US_INFORMATION_RETURNS_REGIME, ruleKey: "form_1099_reporting_threshold_usd" };
}

export function efileThresholdRule(): TaxRuleLineage {
  return { country: "US", jurisdiction: null, regime: US_INFORMATION_RETURNS_REGIME, ruleKey: "information_return_efile_threshold_count" };
}

export function parseForm1099ThresholdValue(value: Record<string, unknown>): Form1099ThresholdRuleValue | null {
  const thresholdUsd = value.thresholdUsd;
  if (typeof thresholdUsd !== "number" || !Number.isFinite(thresholdUsd)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Form 1099-NEC/MISC reporting threshold";
  return { thresholdUsd, label };
}

export function parseEfileThresholdValue(value: Record<string, unknown>): EfileThresholdRuleValue | null {
  const thresholdCount = value.thresholdCount;
  if (typeof thresholdCount !== "number" || !Number.isFinite(thresholdCount)) return null;
  const label = typeof value.label === "string" && value.label.trim() ? value.label : "Aggregate e-file threshold for information returns";
  return { thresholdCount, label };
}

export async function getEffectiveForm1099Threshold(asOf?: string): Promise<ResolvedForm1099ThresholdRule | null> {
  const rule = await getEffectiveTaxRule(form1099ThresholdRule(), asOf);
  if (!rule) return null;
  const parsed = parseForm1099ThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}

export async function getEffectiveEfileThreshold(asOf?: string): Promise<ResolvedEfileThresholdRule | null> {
  const rule = await getEffectiveTaxRule(efileThresholdRule(), asOf);
  if (!rule) return null;
  const parsed = parseEfileThresholdValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
