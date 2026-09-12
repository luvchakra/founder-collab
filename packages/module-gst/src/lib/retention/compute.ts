import { gstr9DueDate, type Gstr9DueDateRuleValue } from "../calendar/due-dates";

/**
 * COMPLY-P0-10.5 (Retention Rules): pure -- "72 months from the annual return due date"
 * (Section 36 of the CGST Act), reusing COMPLY-P0-09.1's own `gstr9DueDate` for the "due
 * date" half rather than re-deriving GSTR-9's own due-date arithmetic a second time.
 * `retentionMonths` is always a multiple of 12 in real GST practice (72), so simple
 * calendar-month addition never runs into a day-of-month overflow edge case (31-Dec plus
 * a whole number of years is always 31-Dec) -- this would need more care for a
 * non-12-multiple input, which no real GST retention rule this session found ever is.
 */
function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/**
 * The date GST records for the financial year ending `financialYearEndDate` (e.g.
 * `"2026-03-31"` for FY 2025-26) must be retained UNTIL, under Section 36's base
 * 72-month rule. Does NOT account for Section 36's own longer-if-applicable
 * appeal/investigation extension -- see this module's own migration comment for why
 * (no dispute-tracking concept exists anywhere in this platform to know whether it
 * applies to a given record); a caller with real knowledge of an active dispute over
 * this specific evidence should treat this date as a FLOOR, not a ceiling.
 */
export function computeGstRetentionUntil(financialYearEndDate: string, retentionMonths: number, gstr9Rule: Gstr9DueDateRuleValue): string {
  const returnDueDate = gstr9DueDate(financialYearEndDate, gstr9Rule);
  return addMonths(returnDueDate, retentionMonths);
}
