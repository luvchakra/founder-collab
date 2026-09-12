import type { ResolvedSgGstProspectiveGracePeriodRule, ResolvedSgGstRegistrationThresholdRule, SgGstRegistrationTestResult } from "./types";

/**
 * COMPLY-P1-04.1 (GST Registration): IRAS's own two independent tests for whether GST
 * registration is COMPULSORY, verified via WebSearch 2026-09-12 (formvalidation.io,
 * contactone.com.sg, excellencesg.com, growacross.com, tassure.com, assemblyworks.co --
 * all independently agreeing; IRAS's own registering-for-gst pages could not be reached
 * directly by this session's WebFetch tool, egress-blocked, same posture this module's own
 * COMPLY-P1-01.5 entry already documented for ec.europa.eu/VIES):
 *
 * - **Retrospective test**: at the end of any calendar quarter (Mar/Jun/Sep/Dec), if
 *   taxable turnover for that quarter PLUS the preceding three quarters (a trailing
 *   12-month window) exceeds S$1,000,000, registration is compulsory -- application due
 *   within 30 days of that quarter-end.
 * - **Prospective test**: if there are reasonable grounds to expect taxable turnover over
 *   the NEXT 12 months will exceed S$1,000,000, registration is compulsory -- application
 *   due within 30 days of the forecast date. **Since 1-Jul-2025** (confirmed via WebSearch
 *   2026-09-12), a business registering on the prospective basis gets a two-month grace
 *   period before it must start CHARGING GST -- a real, dated regulatory detail this
 *   function surfaces as an informational note (`SgGstProspectiveGracePeriodRuleValue`,
 *   seeded as its own separate versioned rule, `null`/absent before that date), never a
 *   computed charging-start DATE (see below for why).
 *
 * A strict EXCEEDS comparison (`>`, not `>=`) -- IRAS's own statutory wording is "exceeds
 * S$1 million," the same wording convention `determineSmallSupplierRegistrationObligation`
 * (Canada, "exceeds $30,000") already uses `>` for, distinct from COMPLY-P1-02.8's own
 * "$600 or more" 1099 threshold, whose different statutory wording really is inclusive.
 *
 * **What this does NOT model, named explicitly** (the same "obligation, not full deadline
 * mechanics" scope boundary COMPLY-P1-02.4/03's own registration-obligation functions
 * already drew): the exact date GST charging must begin once a registration actually takes
 * effect (IRAS assigns an effective registration date as part of processing the
 * application; this platform has no registration-processing workflow to derive that date
 * from) -- `applicationDeadline` is the one deadline this function computes (a pure 30-day
 * offset from the test date), not a claim about when charging starts.
 */

const APPLICATION_DEADLINE_DAYS = 30;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatSgd(amount: number): string {
  return `S$${amount.toLocaleString("en-SG")}`;
}

export function determineSgRetrospectiveRegistrationObligation(
  trailing12MonthTurnoverSgd: number,
  quarterEndDate: string,
  thresholdRule: ResolvedSgGstRegistrationThresholdRule | null,
): SgGstRegistrationTestResult {
  if (!thresholdRule) {
    return {
      resolved: false,
      obligated: null,
      thresholdSgd: null,
      applicationDeadline: null,
      reason: "No GST registration threshold rule on file for this date.",
      ruleRefs: [],
    };
  }

  const obligated = trailing12MonthTurnoverSgd > thresholdRule.thresholdSgd;
  return {
    resolved: true,
    obligated,
    thresholdSgd: thresholdRule.thresholdSgd,
    applicationDeadline: obligated ? addDays(quarterEndDate, APPLICATION_DEADLINE_DAYS) : null,
    reason: obligated
      ? `Trailing 12-month taxable turnover of ${formatSgd(trailing12MonthTurnoverSgd)} exceeds the ${formatSgd(thresholdRule.thresholdSgd)} registration threshold as of quarter-end ${quarterEndDate} (retrospective test) -- application due within ${APPLICATION_DEADLINE_DAYS} days.`
      : `Trailing 12-month taxable turnover of ${formatSgd(trailing12MonthTurnoverSgd)} does not exceed the ${formatSgd(thresholdRule.thresholdSgd)} registration threshold as of quarter-end ${quarterEndDate} (retrospective test).`,
    ruleRefs: [thresholdRule.rule.id],
  };
}

export function determineSgProspectiveRegistrationObligation(
  forecastNext12MonthTurnoverSgd: number,
  forecastDate: string,
  thresholdRule: ResolvedSgGstRegistrationThresholdRule | null,
  graceRule: ResolvedSgGstProspectiveGracePeriodRule | null,
): SgGstRegistrationTestResult {
  if (!thresholdRule) {
    return {
      resolved: false,
      obligated: null,
      thresholdSgd: null,
      applicationDeadline: null,
      reason: "No GST registration threshold rule on file for this date.",
      ruleRefs: [],
    };
  }

  const obligated = forecastNext12MonthTurnoverSgd > thresholdRule.thresholdSgd;
  const graceNote = graceRule
    ? ` A ${graceRule.months}-month grace period before GST charging must begin applies to prospective-basis registrants as of this forecast date (${graceRule.label}).`
    : "";
  return {
    resolved: true,
    obligated,
    thresholdSgd: thresholdRule.thresholdSgd,
    applicationDeadline: obligated ? addDays(forecastDate, APPLICATION_DEADLINE_DAYS) : null,
    reason: obligated
      ? `Forecast next-12-month taxable turnover of ${formatSgd(forecastNext12MonthTurnoverSgd)} is expected to exceed the ${formatSgd(thresholdRule.thresholdSgd)} registration threshold as of ${forecastDate} (prospective test) -- application due within ${APPLICATION_DEADLINE_DAYS} days.${graceNote}`
      : `Forecast next-12-month taxable turnover of ${formatSgd(forecastNext12MonthTurnoverSgd)} is not expected to exceed the ${formatSgd(thresholdRule.thresholdSgd)} registration threshold as of ${forecastDate} (prospective test).`,
    ruleRefs: graceRule && obligated ? [thresholdRule.rule.id, graceRule.rule.id] : [thresholdRule.rule.id],
  };
}
