import { getActivationSettings } from "../lib/activation/queries";
import { fiscalYearLabel, fiscalYearOf, monthlyPeriodsForFiscalYear, type PeriodSeed } from "../lib/accounting/periods";

/**
 * EXP-FIN-07/10/11/12/13/15 -- the period a Finance export covers, resolved exactly the
 * way its page resolves the same search params. Each page does this inline; these helpers
 * repeat that selection logic line for line (they compute *which dates*, never any
 * accounting figure) so the file a person downloads covers the period they were looking
 * at. Keep each in step with the page named in its comment.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH = /^\d{4}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export type FiscalContext = {
  fiscalYear: number;
  fiscalYearStartMonth: number;
  /** The twelve monthly periods of the current fiscal year. */
  year: PeriodSeed[];
  /** The month containing today (falls back to the year's first month). */
  thisMonth: PeriodSeed;
  label: string;
};

/** The business's current fiscal year, as finance/budget, finance/reports,
 * finance/gst-ledger and finance/filing-readiness all derive it. */
export async function getFiscalContext(businessId: string): Promise<FiscalContext> {
  const { fiscalYearStartMonth } = await getActivationSettings(businessId);
  const today = todayUtc();
  const fiscalYear = fiscalYearOf(today, fiscalYearStartMonth);
  const year = monthlyPeriodsForFiscalYear(fiscalYear, fiscalYearStartMonth);
  const thisMonth = year.find((p) => p.startDate <= today && today <= p.endDate) ?? year[0]!;
  return { fiscalYear, fiscalYearStartMonth, year, thisMonth, label: fiscalYearLabel(fiscalYear, fiscalYearStartMonth) };
}

/** finance/gst-ledger and finance/filing-readiness: `?period=YYYY-MM` picks a month of
 * the current fiscal year; anything else falls back to the current month. */
export async function resolveFiscalMonth(businessId: string, period: string): Promise<PeriodSeed> {
  const { year } = await getFiscalContext(businessId);
  const today = todayUtc();
  return (
    year.find((p) => p.gstPeriod === period) ??
    year.find((p) => p.startDate <= today && today <= p.endDate) ??
    year[0]!
  );
}

/** finance/reports: `from`/`to` when both are plain ISO dates, otherwise fiscal year to
 * date. */
export async function resolveReportRange(
  businessId: string,
  from: string,
  to: string,
): Promise<{ from: string; to: string }> {
  const { year, thisMonth } = await getFiscalContext(businessId);
  return {
    from: isIsoDate(from) ? from : year[0]!.startDate,
    to: isIsoDate(to) ? to : thisMonth.endDate,
  };
}

/** finance/filing and finance/reconciliation's `currentPeriod()`: this calendar month,
 * `YYYY-MM`, on the server's clock. */
export function currentCalendarPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** A `?period=` value the export will use: a well-formed `YYYY-MM`, or this month. The
 * pages pass the raw value through; an export only ever queries a real month. */
export function calendarPeriodParam(value: string | null | undefined): string {
  return typeof value === "string" && YEAR_MONTH.test(value) ? value : currentCalendarPeriod();
}

/** finance/filing's `periodBounds()`: first and last day of a `YYYY-MM` month. */
export function calendarPeriodBounds(period: string): { start: string; end: string } {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr) || new Date().getFullYear();
  const month = Number(monthStr) || new Date().getMonth() + 1;
  const endDate = new Date(year, month, 0).getDate();
  return { start: `${period}-01`, end: `${period}-${String(endDate).padStart(2, "0")}` };
}
