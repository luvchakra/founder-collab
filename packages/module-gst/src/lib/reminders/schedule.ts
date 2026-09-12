/**
 * COMPLY-P0-09.3 (Reminder Engine): the pure scheduling decision -- "given this
 * obligation's own due date, today's date, and which lead-day thresholds have already
 * been sent, which (if any) new thresholds should fire right now." Kept separate from
 * `mutations.ts`'s own admin-client orchestration (which businesses/obligations exist,
 * sending the actual email, recording the sent marker) so the actual scheduling logic is
 * independently testable without a database.
 */

/** How many days before a due date this platform reminds a business -- a 1-week-out
 * heads-up and a 1-day-out final nudge. Not sourced from `gst.tax_rules` (unlike a real
 * due DATE, which IS a regulatory fact): how far in advance WonderArc chooses to remind
 * someone is this platform's own product decision, not a government rule. */
export const DEFAULT_REMINDER_LEAD_DAYS: readonly number[] = [7, 1];

/** Whole calendar days from `asOf` to `dueDate` (positive when `dueDate` is still ahead,
 * negative once it's passed) -- UTC-safe, same convention as every other date helper in
 * this module. */
export function daysUntil(dueDate: string, asOf: string): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const from = new Date(`${asOf}T00:00:00Z`).getTime();
  return Math.round((due - from) / (24 * 60 * 60 * 1000));
}

/**
 * Which of `configuredLeadDays` should fire right now for one obligation: a threshold
 * fires when the obligation is not yet overdue (`daysUntil >= 0` -- once it's actually
 * overdue this is COMPLY-P0-09.4's own job, not a reminder's), the threshold has been
 * reached (`daysUntil <= leadDays`), and it hasn't already been sent
 * (`alreadySentLeadDays`). Can return more than one entry at once (e.g. a cron that
 * missed several days catching up), or several across separate calls as the due date
 * approaches (the 7-day threshold fires once several days out; the 1-day threshold fires
 * again, separately, once it's actually 1 day out) -- each lead-day value is its own
 * independent, once-only reminder.
 */
export function pendingReminderLeadDays(
  dueDate: string,
  asOf: string,
  alreadySentLeadDays: readonly number[],
  configuredLeadDays: readonly number[] = DEFAULT_REMINDER_LEAD_DAYS,
): number[] {
  const remaining = daysUntil(dueDate, asOf);
  if (remaining < 0) return [];
  return configuredLeadDays.filter((leadDays) => remaining <= leadDays && !alreadySentLeadDays.includes(leadDays));
}
