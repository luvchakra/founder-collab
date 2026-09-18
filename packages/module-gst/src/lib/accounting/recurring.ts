/**
 * Entries that repeat: rent, depreciation, subscriptions, amortised prepayments.
 *
 * The schedule arithmetic lives here, pure, because month-end recurrence is where naive
 * date code quietly goes wrong. An entry set to run on the 31st has to run on the 30th in
 * April and the 28th or 29th in February — and crucially, it must go back to the 31st in
 * May rather than sticking at 28 for the rest of its life, which is what happens when
 * each run is computed from the previous run's actual date instead of from the anchor.
 */

export type RecurrenceFrequency = "monthly" | "quarterly" | "half_yearly" | "annually";

export const RECURRENCE_LABEL: Record<RecurrenceFrequency, string> = {
  monthly: "Every month",
  quarterly: "Every three months",
  half_yearly: "Every six months",
  annually: "Every year",
};

const MONTHS_BETWEEN: Record<RecurrenceFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  annually: 12,
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The nth occurrence after an anchor date.
 *
 * Always computed from the anchor, never from the previous occurrence. That is the whole
 * reason this takes an index rather than "the last run": an entry anchored on the 31st
 * runs on 30 April and then 31 May, where stepping from the previous date would give
 * 30 May, then 30 June, drifting a day earlier every time a short month goes by.
 */
export function occurrenceOf(anchor: string, frequency: RecurrenceFrequency, index: number): string {
  const [year, month, day] = anchor.split("-").map(Number) as [number, number, number];
  const step = MONTHS_BETWEEN[frequency] * index;
  const totalMonths = month - 1 + step;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  // Clamp to the month's real length rather than rolling into the next month, which is
  // what `new Date(y, m, 31)` would do for a 30-day month.
  return iso(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/**
 * Every occurrence due on or before `asOf` that hasn't run yet.
 *
 * Returns the whole backlog rather than just the next one: an entry that was paused, or a
 * drain that didn't run for a week, must catch up completely. Posting only the most
 * recent would leave permanent holes in the ledger that nothing would ever go back for.
 */
export function dueOccurrences(
  anchor: string,
  frequency: RecurrenceFrequency,
  asOf: string,
  options: { lastRunOn?: string | null; endOn?: string | null; limit?: number } = {},
): string[] {
  const limit = options.limit ?? 60;
  const due: string[] = [];

  for (let index = 0; index < limit * 2 && due.length < limit; index += 1) {
    const date = occurrenceOf(anchor, frequency, index);
    if (date > asOf) break;
    if (options.endOn && date > options.endOn) break;
    // `lastRunOn` is the high-water mark, not a cursor: comparing against it rather than
    // counting runs means a manually posted or manually skipped occurrence doesn't shift
    // everything after it.
    if (options.lastRunOn && date <= options.lastRunOn) continue;
    due.push(date);
  }

  return due;
}

/** When this will next run, or null once it has finished. */
export function nextOccurrence(
  anchor: string,
  frequency: RecurrenceFrequency,
  asOf: string,
  options: { lastRunOn?: string | null; endOn?: string | null } = {},
): string | null {
  const after = options.lastRunOn && options.lastRunOn > asOf ? options.lastRunOn : asOf;
  for (let index = 0; index < 400; index += 1) {
    const date = occurrenceOf(anchor, frequency, index);
    if (options.endOn && date > options.endOn) return null;
    if (date > after) return date;
  }
  return null;
}

/**
 * The idempotency key for one occurrence.
 *
 * Derived from the template and the occurrence date, so a drain that runs twice, or
 * catches up a backlog it already partly posted, collides on the entry that exists rather
 * than posting a second one. The unique index on `gst.journal_entries` is what enforces
 * it; this only has to be deterministic.
 */
export function recurringIdempotencyKey(recurringEntryId: string, occurrence: string): string {
  return `finance:recurring:${recurringEntryId}:${occurrence}`;
}

export interface RecurringTemplateLine {
  accountId: string;
  debit: number;
  credit: number;
  memo?: string | null;
}

/** A template is only postable if it balances — an unbalanced one would fail at the
 * database every month, forever, with nobody watching. Checked when it is saved, so the
 * failure happens in front of the person who can fix it. */
export function templateProblems(lines: RecurringTemplateLine[]): string[] {
  const problems: string[] = [];
  if (lines.length < 2) problems.push("A recurring entry needs at least two lines.");
  if (lines.some((l) => !l.accountId)) problems.push("Every line needs an account.");

  const debit = Math.round(lines.reduce((s, l) => s + (l.debit || 0), 0) * 100);
  const credit = Math.round(lines.reduce((s, l) => s + (l.credit || 0), 0) * 100);
  if (debit !== credit) {
    problems.push(`Debits and credits must be equal (off by ${Math.abs(debit - credit) / 100}).`);
  }
  if (debit === 0) problems.push("A recurring entry with no value would post nothing.");

  return problems;
}
