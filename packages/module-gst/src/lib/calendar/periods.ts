/**
 * COMPLY-P0-09.1 (Filing Calendar): pure calendar-period generation, independent of any
 * due-date rule or persisted state -- "which periods exist" is a plain calendar fact
 * (calendar months, QRMP quarters aligned to India's financial year, and the financial
 * year itself), not something a tax rule determines. Every date in/out is an ISO
 * `YYYY-MM-DD` string, parsed/formatted at UTC midnight throughout so this never drifts
 * by a day depending on the server's own local timezone -- same convention
 * `einvoice-reporting-window/determine.ts`'s own `addDays` already established.
 */

export type Period = { periodStart: string; periodEnd: string };

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds `months` calendar months to `isoDate` (day-of-month is not preserved -- this
 * module only ever calls it with day 1, so that never matters in practice). */
function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toIso(date);
}

/** The last calendar day of the month containing `isoDate` (day 1 of that month). Day 0
 * of the FOLLOWING month is the standard trick for "last day of this month" in a
 * UTC-safe way. */
function lastDayOfMonthContaining(isoFirstOfMonth: string): string {
  const date = new Date(`${isoFirstOfMonth}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return toIso(date);
}

function firstOfMonth(year: number, monthIndex0: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
}

/** One calendar month as a `Period`, e.g. `monthPeriod(2026, 8)` (September, 0-indexed)
 * -> `{periodStart: "2026-09-01", periodEnd: "2026-09-30"}`. */
export function monthPeriod(year: number, monthIndex0: number): Period {
  const periodStart = firstOfMonth(year, monthIndex0);
  return { periodStart, periodEnd: lastDayOfMonthContaining(periodStart) };
}

/** Every calendar month whose own start falls within `monthsBack` months before, through
 * `monthsForward` months after, the month containing `referenceDate` (inclusive both
 * ends) -- oldest first. `referenceDate` defaults to today. */
export function generateMonthlyPeriods(referenceDate: string, monthsBack: number, monthsForward: number): Period[] {
  const refFirstOfMonth = `${referenceDate.slice(0, 7)}-01`;
  const periods: Period[] = [];
  for (let offset = -monthsBack; offset <= monthsForward; offset++) {
    const start = addMonths(refFirstOfMonth, offset);
    periods.push({ periodStart: start, periodEnd: lastDayOfMonthContaining(start) });
  }
  return periods;
}

/**
 * The QRMP quarter (aligned to India's financial year -- Apr-Jun / Jul-Sep / Oct-Dec /
 * Jan-Mar, NOT the calendar-year Jan-Mar/Apr-Jun/... quarters) containing `isoDate`.
 * QRMP's own quarters follow the financial year because GST itself is administered on
 * the Indian financial year, not the calendar year.
 */
export function qrmpQuarterContaining(isoDate: string): Period {
  const [yearStr, monthStr] = isoDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  // The financial year (Apr..Mar) `isoDate` falls in, and how many months into it.
  const fyStartYear = month >= 4 ? year : year - 1;
  const monthsSinceApril = (month - 4 + 12) % 12; // 0 = April, ..., 11 = March
  const quarterIndex = Math.floor(monthsSinceApril / 3); // 0=Apr-Jun, 1=Jul-Sep, 2=Oct-Dec, 3=Jan-Mar

  const periodStart = addMonths(`${fyStartYear}-04-01`, quarterIndex * 3);
  const periodEndMonth = addMonths(periodStart, 2);
  return { periodStart, periodEnd: lastDayOfMonthContaining(periodEndMonth) };
}

/** Every QRMP quarter whose own start falls within `quartersBack` quarters before,
 * through `quartersForward` quarters after, the quarter containing `referenceDate`
 * (inclusive both ends) -- oldest first. */
export function generateQrmpQuarters(referenceDate: string, quartersBack: number, quartersForward: number): Period[] {
  const refQuarter = qrmpQuarterContaining(referenceDate);
  const periods: Period[] = [];
  for (let offset = -quartersBack; offset <= quartersForward; offset++) {
    const start = addMonths(refQuarter.periodStart, offset * 3);
    const endMonth = addMonths(start, 2);
    periods.push({ periodStart: start, periodEnd: lastDayOfMonthContaining(endMonth) });
  }
  return periods;
}

/** The Indian financial year (01-Apr..31-Mar) containing `isoDate`, e.g. any date in
 * Apr-2026..Mar-2027 -> `{periodStart: "2026-04-01", periodEnd: "2027-03-31"}`. */
export function financialYearContaining(isoDate: string): Period {
  const [yearStr, monthStr] = isoDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const fyStartYear = month >= 4 ? year : year - 1;
  const periodStart = firstOfMonth(fyStartYear, 3); // April
  const periodEnd = `${fyStartYear + 1}-03-31`;
  return { periodStart, periodEnd };
}

/** Every Indian financial year whose own start falls within `yearsBack` years before,
 * through `yearsForward` years after, the financial year containing `referenceDate`
 * (inclusive both ends) -- oldest first. */
export function generateFinancialYears(referenceDate: string, yearsBack: number, yearsForward: number): Period[] {
  const refFy = financialYearContaining(referenceDate);
  const refStartYear = Number(refFy.periodStart.slice(0, 4));
  const periods: Period[] = [];
  for (let offset = -yearsBack; offset <= yearsForward; offset++) {
    const startYear = refStartYear + offset;
    periods.push({ periodStart: `${startYear}-04-01`, periodEnd: `${startYear + 1}-03-31` });
  }
  return periods;
}
