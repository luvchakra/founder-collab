/**
 * Accounting periods: the calendar the ledger is kept and closed against.
 *
 * Everything here is pure date and state arithmetic, deliberately kept away from the
 * database, because these are the rules that decide whether a filed month can be edited
 * afterwards -- worth stating once, in one place, and testing directly.
 */

export type PeriodStatus = "open" | "review" | "locked" | "filed" | "closed";

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  open: "Open",
  review: "In review",
  locked: "Locked",
  filed: "Filed",
  closed: "Closed",
};

export interface PeriodSeed {
  /** The calendar year the fiscal year *starts* in: FY 2026-27 is 2026. */
  fiscalYear: number;
  /** ISO dates, inclusive of both ends. */
  startDate: string;
  endDate: string;
  /** `YYYY-MM`, matching `gst.return_periods`' own spelling so an accounting period
   * lines up with the GST return it feeds. */
  gstPeriod: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Days in a month, leap years included -- day 0 of the next month is the last day of
 * this one. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The twelve monthly periods of one fiscal year.
 *
 * Monthly rather than quarterly because GST returns are monthly for most businesses, and
 * a monthly ledger close rolls up into a quarter but not the other way around.
 *
 * `fiscalYearStartMonth` defaults to April (India's fiscal year, and this module's home
 * jurisdiction) but is a parameter, not a constant: the same accounting period machinery
 * serves the US/EU/Canada/Singapore country packs this module already supports, and
 * their fiscal years do not start in April.
 */
export function monthlyPeriodsForFiscalYear(fiscalYear: number, fiscalYearStartMonth = 4): PeriodSeed[] {
  if (!Number.isInteger(fiscalYear)) throw new Error("A fiscal year must be a whole year.");
  if (fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
    throw new Error("A fiscal year starts in one of the twelve months.");
  }

  return Array.from({ length: 12 }, (_, i) => {
    const monthIndex = fiscalYearStartMonth - 1 + i;
    const year = fiscalYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return {
      fiscalYear,
      startDate: iso(year, month, 1),
      endDate: iso(year, month, lastDayOfMonth(year, month)),
      gstPeriod: `${year}-${pad(month)}`,
    };
  });
}

/** "FY 2026-27" when the year straddles two calendar years, "FY 2026" when it doesn't. */
export function fiscalYearLabel(fiscalYear: number, fiscalYearStartMonth = 4): string {
  if (fiscalYearStartMonth === 1) return `FY ${fiscalYear}`;
  return `FY ${fiscalYear}-${pad((fiscalYear + 1) % 100)}`;
}

/** Which fiscal year a date falls in, under the same start month. */
export function fiscalYearOf(date: string, fiscalYearStartMonth = 4): number {
  const [year, month] = date.split("-").map(Number) as [number, number];
  return month >= fiscalYearStartMonth ? year : year - 1;
}

/**
 * Which statuses a period may move to next.
 *
 * Forward through the close: open -> in review -> locked -> filed -> closed. A locked
 * period can be reopened -- locking is a "stop posting while we reconcile" signal, and
 * finding a genuine error during review has to be fixable. Filed and closed cannot:
 * once a return has gone to the tax authority, the period's numbers are what was filed,
 * and a correction belongs in an open period as a reversing entry, not as a quiet edit
 * to history that would stop the filed return reconciling to the ledger behind it.
 */
const TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  open: ["review", "locked"],
  review: ["open", "locked"],
  locked: ["open", "review", "filed", "closed"],
  filed: ["closed"],
  closed: [],
};

export function allowedPeriodTransitions(from: PeriodStatus): PeriodStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionPeriod(from: PeriodStatus, to: PeriodStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Why a transition was refused, in words a user can act on. */
export function explainPeriodTransition(from: PeriodStatus, to: PeriodStatus): string | null {
  if (canTransitionPeriod(from, to)) return null;
  if (from === to) return `This period is already ${PERIOD_STATUS_LABEL[to].toLowerCase()}.`;
  if (from === "closed") {
    return "A closed period is final. Post a correcting entry in an open period instead.";
  }
  if (from === "filed") {
    return "This period's return has been filed, so its numbers have to stay as filed. Post a correcting entry in an open period instead.";
  }
  return `A period can't go straight from ${PERIOD_STATUS_LABEL[from].toLowerCase()} to ${PERIOD_STATUS_LABEL[to].toLowerCase()}.`;
}

export function isPeriodStatus(value: string): value is PeriodStatus {
  return value in TRANSITIONS;
}

/** The period a posting date falls in, or undefined when no period covers it yet. */
export function periodForDate<T extends { start_date: string; end_date: string }>(
  periods: T[],
  date: string,
): T | undefined {
  return periods.find((p) => p.start_date <= date && date <= p.end_date);
}
