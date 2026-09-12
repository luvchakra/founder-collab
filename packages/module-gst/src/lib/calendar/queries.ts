import { getPrimaryTaxRegistration } from "../tax-registrations/queries";
import { parseGstRegistrationProfile } from "../tax-registrations/gst-registration-profile";
import { getEffectiveTaxRule } from "../tax-rules/queries";
import { listReturnPeriods } from "../returns/lifecycle/queries";
import type { ReturnPeriod, ReturnType } from "../returns/lifecycle/types";
import { generateMonthlyPeriods, generateQrmpQuarters, generateFinancialYears, type Period } from "./periods";
import { gstr1DueDate, gstr3bDueDate, gstr3bQrmpInstallmentDueDates, gstr9DueDate, type Gstr1DueDateRuleValue, type Gstr3bDueDateRuleValue, type Gstr9DueDateRuleValue } from "./due-dates";
import type { FilingObligation, PaymentObligation } from "./types";

/**
 * COMPLY-P0-09.1 (Filing Calendar) / COMPLY-P0-09.2 (Payment Calendar): the orchestrators
 * -- schema-free, same "compute on demand" philosophy `lib/returns/{gstr1,gstr3b,gstr9}`
 * already established for return CONTENT. This folder does the same for return/payment
 * DUE DATES: no new persisted state, just this business's own already-on-file
 * registration (frequency + jurisdiction), the currently-effective seeded due-date rules,
 * and whatever `gst.return_periods` rows already exist to correlate lifecycle/payment
 * status onto.
 *
 * **Single-registration simplification** (see `types.ts`'s own docstring): reads only
 * this business's PRIMARY India/GST registration, matching every return preparer in this
 * module. A business with zero registrations, or none marked primary, gets an empty
 * calendar -- a real, honest "nothing to compute a due date FROM yet," not an error
 * (COMPLY-P0-09.5's own "Missing tax registration" risk signal is what actually flags
 * that state to a human).
 *
 * **No payment AMOUNT anywhere in this file** (backlog rule 11: never claim more than is
 * actually known) -- this module has no real self-assessed or 35%-of-last-quarter
 * liability computation for a QRMP installment, and a monthly/quarterly GSTR-3B's own
 * "amount payable" depends on the full return computation (`lib/returns/gstr3b`), which
 * this calendar deliberately does not re-run just to answer "what's due" -- a caller
 * that also needs the amount already has `getGstr3bReturn`/`gst.return_periods.snapshot`
 * for that.
 */

const DEFAULT_MONTHS_BACK = 2;
const DEFAULT_MONTHS_FORWARD = 2;
const DEFAULT_QUARTERS_BACK = 1;
const DEFAULT_QUARTERS_FORWARD = 1;
const DEFAULT_YEARS_BACK = 1;

export type CalendarWindowOptions = {
  /** Evaluate as of this date instead of today -- forwarded to the effective-rule lookup
   * and used as the anchor for how far back/forward periods are generated. */
  referenceDate?: string;
  monthsBack?: number;
  monthsForward?: number;
  quartersBack?: number;
  quartersForward?: number;
  yearsBack?: number;
};

type ResolvedContext = {
  frequency: "monthly" | "quarterly";
  jurisdiction: string | null;
  gstr1Rule: Gstr1DueDateRuleValue | null;
  gstr3bRule: Gstr3bDueDateRuleValue | null;
  gstr9Rule: Gstr9DueDateRuleValue | null;
  existingPeriods: ReturnPeriod[];
};

async function resolveContext(businessId: string, referenceDate: string): Promise<ResolvedContext | null> {
  const registration = await getPrimaryTaxRegistration(businessId, "IN", "GST");
  if (!registration) return null;

  const profile = parseGstRegistrationProfile(registration.metadata);
  const [gstr1Rule, gstr3bRule, gstr9Rule, existingPeriods] = await Promise.all([
    getEffectiveTaxRule({ country: "IN", regime: "GST", jurisdiction: null, ruleKey: "gstr1_filing_due_dates" }, referenceDate),
    getEffectiveTaxRule({ country: "IN", regime: "GST", jurisdiction: null, ruleKey: "gstr3b_filing_due_dates" }, referenceDate),
    getEffectiveTaxRule({ country: "IN", regime: "GST", jurisdiction: null, ruleKey: "gstr9_filing_due_date" }, referenceDate),
    listReturnPeriods(businessId),
  ]);

  return {
    frequency: profile.returnFrequency,
    jurisdiction: registration.jurisdiction,
    gstr1Rule: (gstr1Rule?.value as Gstr1DueDateRuleValue | undefined) ?? null,
    gstr3bRule: (gstr3bRule?.value as Gstr3bDueDateRuleValue | undefined) ?? null,
    gstr9Rule: (gstr9Rule?.value as Gstr9DueDateRuleValue | undefined) ?? null,
    existingPeriods,
  };
}

function findExistingPeriod(existing: ReturnPeriod[], returnType: ReturnType, period: Period): ReturnPeriod | null {
  return existing.find((p) => p.returnType === returnType && p.periodStart === period.periodStart && p.periodEnd === period.periodEnd) ?? null;
}

function toObligation(returnType: ReturnType, period: Period, dueDate: string, existing: ReturnPeriod | null): FilingObligation {
  return {
    returnType,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueDate,
    status: existing?.status ?? null,
    returnPeriodId: existing?.id ?? null,
  };
}

/**
 * COMPLY-P0-09.1 (Filing Calendar): every GSTR-1/3B/9 obligation whose own period falls
 * within the requested window (default: 2 months back/forward for monthly returns, 1
 * quarter back/forward for quarterly, 1 financial year back for GSTR-9), each with its
 * real computed due date and, where one already exists, its `gst.return_periods`
 * lifecycle status. Returns `[]` when this business has no primary India/GST
 * registration on file yet, or no due-date rule could be resolved for `referenceDate`.
 * Sorted by due date, earliest first.
 */
export async function getFilingCalendar(businessId: string, options: CalendarWindowOptions = {}): Promise<FilingObligation[]> {
  const referenceDate = options.referenceDate ?? new Date().toISOString().slice(0, 10);
  const context = await resolveContext(businessId, referenceDate);
  if (!context) return [];

  const obligations: FilingObligation[] = [];

  if (context.gstr1Rule) {
    const periods =
      context.frequency === "monthly"
        ? generateMonthlyPeriods(referenceDate, options.monthsBack ?? DEFAULT_MONTHS_BACK, options.monthsForward ?? DEFAULT_MONTHS_FORWARD)
        : generateQrmpQuarters(referenceDate, options.quartersBack ?? DEFAULT_QUARTERS_BACK, options.quartersForward ?? DEFAULT_QUARTERS_FORWARD);
    for (const period of periods) {
      const dueDate = gstr1DueDate(period.periodEnd, context.frequency, context.gstr1Rule);
      obligations.push(toObligation("gstr1", period, dueDate, findExistingPeriod(context.existingPeriods, "gstr1", period)));
    }
  }

  if (context.gstr3bRule) {
    const periods =
      context.frequency === "monthly"
        ? generateMonthlyPeriods(referenceDate, options.monthsBack ?? DEFAULT_MONTHS_BACK, options.monthsForward ?? DEFAULT_MONTHS_FORWARD)
        : generateQrmpQuarters(referenceDate, options.quartersBack ?? DEFAULT_QUARTERS_BACK, options.quartersForward ?? DEFAULT_QUARTERS_FORWARD);
    for (const period of periods) {
      const dueDate = gstr3bDueDate(period.periodEnd, context.frequency, context.jurisdiction, context.gstr3bRule);
      obligations.push(toObligation("gstr3b", period, dueDate, findExistingPeriod(context.existingPeriods, "gstr3b", period)));
    }
  }

  if (context.gstr9Rule) {
    const periods = generateFinancialYears(referenceDate, options.yearsBack ?? DEFAULT_YEARS_BACK, 0);
    for (const period of periods) {
      const dueDate = gstr9DueDate(period.periodEnd, context.gstr9Rule);
      obligations.push(toObligation("gstr9", period, dueDate, findExistingPeriod(context.existingPeriods, "gstr9", period)));
    }
  }

  return obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * COMPLY-P0-09.2 (Payment Calendar): every tax PAYMENT obligation (as opposed to return
 * FILING obligation -- see `types.ts`'s own `PaymentObligation` docstring) within the
 * requested window. A monthly filer gets one `"settlement"` entry per month (identical
 * due date to that month's own GSTR-3B); a QRMP quarterly filer gets two `"installment"`
 * entries per quarter (PMT-06, no persisted status -- see this file's own top docstring)
 * plus one `"settlement"` entry for the quarter's own GSTR-3B. Sorted by due date,
 * earliest first.
 */
export async function getPaymentCalendar(businessId: string, options: CalendarWindowOptions = {}): Promise<PaymentObligation[]> {
  const referenceDate = options.referenceDate ?? new Date().toISOString().slice(0, 10);
  const context = await resolveContext(businessId, referenceDate);
  if (!context || !context.gstr3bRule) return [];

  const periods =
    context.frequency === "monthly"
      ? generateMonthlyPeriods(referenceDate, options.monthsBack ?? DEFAULT_MONTHS_BACK, options.monthsForward ?? DEFAULT_MONTHS_FORWARD)
      : generateQrmpQuarters(referenceDate, options.quartersBack ?? DEFAULT_QUARTERS_BACK, options.quartersForward ?? DEFAULT_QUARTERS_FORWARD);

  const obligations: PaymentObligation[] = [];

  for (const period of periods) {
    const settlementDueDate = gstr3bDueDate(period.periodEnd, context.frequency, context.jurisdiction, context.gstr3bRule);
    const existing = findExistingPeriod(context.existingPeriods, "gstr3b", period);
    obligations.push({
      kind: "settlement",
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dueDate: settlementDueDate,
      paymentStatus: existing?.paymentStatus ?? null,
      paymentDate: existing?.paymentDate ?? null,
    });

    if (context.frequency === "quarterly") {
      const [firstMonthDueDate, secondMonthDueDate] = gstr3bQrmpInstallmentDueDates(period.periodStart, context.gstr3bRule);
      obligations.push(
        { kind: "installment", periodStart: period.periodStart, periodEnd: period.periodEnd, dueDate: firstMonthDueDate, paymentStatus: null, paymentDate: null },
        { kind: "installment", periodStart: period.periodStart, periodEnd: period.periodEnd, dueDate: secondMonthDueDate, paymentStatus: null, paymentDate: null },
      );
    }
  }

  return obligations.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
