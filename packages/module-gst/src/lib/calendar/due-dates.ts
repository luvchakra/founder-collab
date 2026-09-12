import type { GstReturnFrequency } from "../tax-registrations/gst-registration-profile";
import type { QrmpStateCategory } from "./types";

/**
 * COMPLY-P0-09.1 (Filing Calendar) / COMPLY-P0-09.2 (Payment Calendar): pure due-date
 * arithmetic over the shape the seeded `gstr1_filing_due_dates`/`gstr3b_filing_due_dates`/
 * `gstr9_filing_due_date` `gst.tax_rules` rows carry (see that migration's own docstring
 * for the sourced facts) -- every number here comes from the caller-supplied rule value,
 * never a literal in this file, so a future amended due date only ever needs a new rule
 * VERSION, never a code change.
 */

export type Gstr3bDueDateRuleValue = {
  monthlyDueDay: number;
  qrmpInstallmentDueDay: number;
  categoryX: { dueDay: number; states: string[] };
  categoryY: { dueDay: number; states: string[] };
};

export type Gstr1DueDateRuleValue = { monthlyDueDay: number; quarterlyDueDay: number };

export type Gstr9DueDateRuleValue = { dueMonth: number; dueDay: number };

/** `day` of the month immediately AFTER the month containing `periodEnd` -- the shared
 * shape every GSTR-1/3B due date actually has ("Nth of the FOLLOWING month"). Pure string
 * arithmetic, UTC-safe, same convention as `periods.ts`. */
function dayOfFollowingMonth(periodEnd: string, day: number): string {
  const date = new Date(`${periodEnd}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(day);
  return date.toISOString().slice(0, 10);
}

/** `day` of the given calendar `year` and `month` (1-12) -- for GSTR-9's own "31
 * December of [the FY's end year]" shape, which is not "the month after periodEnd" like
 * GSTR-1/3B. */
function dayOfMonthInYear(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function classifyQrmpState(jurisdiction: string | null, rule: Gstr3bDueDateRuleValue): QrmpStateCategory {
  if (!jurisdiction) return null;
  if (rule.categoryX.states.includes(jurisdiction)) return "X";
  if (rule.categoryY.states.includes(jurisdiction)) return "Y";
  return null;
}

/** GSTR-1's own due date for one period -- 11th of the following month for monthly
 * filers, 13th of the month following the quarter for QRMP quarterly filers. */
export function gstr1DueDate(periodEnd: string, frequency: GstReturnFrequency, rule: Gstr1DueDateRuleValue): string {
  const day = frequency === "monthly" ? rule.monthlyDueDay : rule.quarterlyDueDay;
  return dayOfFollowingMonth(periodEnd, day);
}

/**
 * GSTR-3B's own due date for one period. Monthly filers: `monthlyDueDay` of the
 * following month. QRMP quarterly filers: the Category X/Y due day, resolved from the
 * business's own registered jurisdiction -- when the jurisdiction can't be classified
 * into either category (no jurisdiction on file, or a value the rule's own state lists
 * don't recognize), this deliberately falls back to `categoryY`'s own (later) due day
 * rather than the earlier `categoryX` one: a business whose real category is unknown
 * should never be shown a due date EARLIER than its real one might be (backlog rule 11 --
 * never understate an obligation), and returning `null`/throwing here would break every
 * caller that just wants a best-effort calendar entry to show. The unresolved-category
 * fact itself is still surfaced via `classifyQrmpState`, not silently hidden.
 */
export function gstr3bDueDate(periodEnd: string, frequency: GstReturnFrequency, jurisdiction: string | null, rule: Gstr3bDueDateRuleValue): string {
  if (frequency === "monthly") return dayOfFollowingMonth(periodEnd, rule.monthlyDueDay);
  const category = classifyQrmpState(jurisdiction, rule);
  const day = category === "X" ? rule.categoryX.dueDay : rule.categoryY.dueDay;
  return dayOfFollowingMonth(periodEnd, day);
}

/** COMPLY-P0-09.2 (Payment Calendar): the two PMT-06 installment due dates for a QRMP
 * quarter -- the 25th of the quarter's own first and second month. Meaningless for a
 * monthly filer (no installment concept applies -- a monthly filer's only payment
 * obligation is the GSTR-3B settlement itself), so this is only ever called for
 * `frequency === "quarterly"`. */
export function gstr3bQrmpInstallmentDueDates(periodStart: string, rule: Gstr3bDueDateRuleValue): [string, string] {
  const month1 = new Date(`${periodStart}T00:00:00Z`);
  month1.setUTCMonth(month1.getUTCMonth() + 1);
  month1.setUTCDate(rule.qrmpInstallmentDueDay);
  const month2 = new Date(`${periodStart}T00:00:00Z`);
  month2.setUTCMonth(month2.getUTCMonth() + 2);
  month2.setUTCDate(rule.qrmpInstallmentDueDay);
  return [month1.toISOString().slice(0, 10), month2.toISOString().slice(0, 10)];
}

/** GSTR-9's own due date -- always 31 December of the calendar year `periodEnd` (the
 * financial year's own 31-Mar end date) falls in. */
export function gstr9DueDate(periodEnd: string, rule: Gstr9DueDateRuleValue): string {
  const fyEndYear = Number(periodEnd.slice(0, 4));
  return dayOfMonthInYear(fyEndYear, rule.dueMonth, rule.dueDay);
}
