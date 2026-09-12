import { getEffectiveTaxRule } from "../tax-rules/queries";
import type { Gstr9DueDateRuleValue } from "../calendar/due-dates";
import { getEffectiveGstRecordRetentionRule, getEffectiveSgGstRecordRetentionRule } from "./rule";
import { computeGstRetentionUntil, computeSgGstRetentionUntil } from "./compute";

/**
 * COMPLY-P0-10.5 (Retention Rules): the orchestrator -- resolves both the retention rule
 * (COMPLY-P0-10.5's own `gst_record_retention_months`) and the annual-return due-date
 * rule (COMPLY-P0-09.1's own `gstr9_filing_due_date`) as of `asOf`, then hands both to
 * the pure `computeGstRetentionUntil`. Returns `null` when EITHER rule cannot be
 * resolved for `asOf` -- never guesses a retention date from only half the facts it
 * needs.
 */
export async function getGstRetentionUntil(financialYearEndDate: string, asOf?: string): Promise<{ retentionUntil: string; retentionMonths: number } | null> {
  const [retentionRule, gstr9RuleRow] = await Promise.all([
    getEffectiveGstRecordRetentionRule(asOf),
    getEffectiveTaxRule({ country: "IN", regime: "GST", jurisdiction: null, ruleKey: "gstr9_filing_due_date" }, asOf),
  ]);
  if (!retentionRule) return null;
  const gstr9Rule = gstr9RuleRow?.value as Gstr9DueDateRuleValue | undefined;
  if (!gstr9Rule) return null;

  return {
    retentionUntil: computeGstRetentionUntil(financialYearEndDate, retentionRule.months, gstr9Rule),
    retentionMonths: retentionRule.months,
  };
}

/**
 * COMPLY-P1-04.7 (Singapore -- Five-Year Record Retention): the Singapore counterpart to
 * `getGstRetentionUntil` above -- resolves the versioned SG retention rule as of `asOf`
 * and hands it straight to the pure `computeSgGstRetentionUntil`. Needs no second rule
 * lookup (unlike India's own GSTR-9-due-date dependency) since Singapore's own basis
 * counts directly from the accounting period end. Returns `null` when no retention rule
 * resolves for `asOf` -- never guesses a retention date.
 */
export async function getSgGstRetentionUntil(accountingPeriodEndDate: string, asOf?: string): Promise<{ retentionUntil: string; retentionMonths: number } | null> {
  const retentionRule = await getEffectiveSgGstRecordRetentionRule(asOf);
  if (!retentionRule) return null;

  return {
    retentionUntil: computeSgGstRetentionUntil(accountingPeriodEndDate, retentionRule.months),
    retentionMonths: retentionRule.months,
  };
}
