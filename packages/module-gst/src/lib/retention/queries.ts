import { getEffectiveTaxRule } from "../tax-rules/queries";
import type { Gstr9DueDateRuleValue } from "../calendar/due-dates";
import { getEffectiveGstRecordRetentionRule } from "./rule";
import { computeGstRetentionUntil } from "./compute";

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
