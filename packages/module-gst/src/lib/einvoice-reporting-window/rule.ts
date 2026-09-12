import { getEffectiveTaxRule, type TaxRuleLineage } from "../tax-rules/queries";
import type { TaxRule } from "../tax-rules/types";

/**
 * COMPLY-P0-05.5 (Reporting Deadline Control): the lineage identifier for the versioned
 * e-invoice reporting-window rule (30 days, applicable to AATO ₹100 crore+ from
 * 01-Nov-2023, lowered to AATO ₹10 crore+ from 01-Apr-2025 -- see the seed migration's own
 * comment, `20260912040000_gst_tax_rules_einvoice_reporting_window_seed.sql`, for full
 * sourcing). A DIFFERENT rule from COMPLY-P0-05.1's own `einvoice_turnover_threshold_inr`
 * (which decides whether e-invoicing is mandated at all) -- this one decides whether an
 * already-mandated e-invoice must reach the IRP within a fixed window of its own invoice
 * date.
 */
export const EINVOICE_REPORTING_WINDOW_RULE: TaxRuleLineage = {
  country: "IN",
  regime: "GST",
  jurisdiction: null,
  ruleKey: "einvoice_reporting_window_days",
};

export type EinvoiceReportingWindowRuleValue = {
  aatoThresholdInr: number;
  windowDays: number;
  label: string;
};

/**
 * Defensive parse of `gst.tax_rules.value` for this specific rule_key -- same "opaque
 * jsonb, never assume its shape" posture every other `parse*Value` function in this module
 * already established (COMPLY-P0-04.7's `parseRateSlabValue`, COMPLY-P0-05.1's
 * `parseEinvoiceThresholdValue`). Returns `null` for anything malformed, treated the same
 * as "no rule found."
 */
export function parseEinvoiceReportingWindowValue(value: Record<string, unknown>): EinvoiceReportingWindowRuleValue | null {
  const aatoThresholdInr = value.aatoThresholdInr;
  const windowDays = value.windowDays;
  if (typeof aatoThresholdInr !== "number" || !Number.isFinite(aatoThresholdInr) || aatoThresholdInr <= 0) return null;
  if (typeof windowDays !== "number" || !Number.isFinite(windowDays) || windowDays <= 0) return null;

  const label = typeof value.label === "string" && value.label.trim() ? value.label : "e-Invoice reporting window";
  return { aatoThresholdInr, windowDays, label };
}

/**
 * The e-invoice reporting-window rule in effect as of `asOf` (defaults to today) -- `null`
 * when no version covers that date, or the stored value doesn't parse. Never guesses a
 * fallback. Same convention as COMPLY-P0-05.1's own `getEffectiveEinvoiceThreshold`.
 */
export async function getEffectiveEinvoiceReportingWindow(
  asOf?: string,
): Promise<(EinvoiceReportingWindowRuleValue & { rule: TaxRule }) | null> {
  const rule = await getEffectiveTaxRule(EINVOICE_REPORTING_WINDOW_RULE, asOf);
  if (!rule) return null;
  const parsed = parseEinvoiceReportingWindowValue(rule.value);
  if (!parsed) return null;
  return { ...parsed, rule };
}
