import type { BreakdownItem } from "@cofounderai/core/ui/breakdown-bars";
import type { InvoiceListItem } from "../invoices/types";
import type { Job, JobStatus } from "../jobs/types";
import type { OpportunityListItem } from "../opportunities/types";

export type { BreakdownItem };

const DAY_MS = 24 * 60 * 60 * 1000;

const JOB_STATUS_ORDER: { key: JobStatus; label: string }[] = [
  { key: "unscheduled", label: "Unscheduled" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In progress" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

/** Every job status, in a fixed display order, so "Completed" always draws the same
 * color regardless of which statuses happen to be non-zero this week. */
export function buildJobStatusBreakdown(jobs: Job[]): BreakdownItem[] {
  const counts = new Map<string, number>();
  for (const j of jobs) counts.set(j.status, (counts.get(j.status) ?? 0) + 1);
  return JOB_STATUS_ORDER.map(({ key, label }) => ({ key, label, value: counts.get(key) ?? 0 }));
}

/** A billable invoice -- draft/voided invoices are neither revenue nor a receivable. */
function isBillable(invoice: InvoiceListItem): boolean {
  return invoice.status !== "draft" && invoice.status !== "voided";
}

export type RevenueTrendPoint = { date: string; label: string; total: number };

/** Daily invoiced total for the last `days` days (default 30), by `doc_date` -- every
 * day present even at zero, same continuous-timeline shape as discovery's prospect
 * trend. This is billed revenue (what was invoiced), not collected cash -- the module
 * has no payments ledger yet to compute the latter from. */
export function buildRevenueTrend(invoices: InvoiceListItem[], days = 30): RevenueTrendPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totals = new Map<string, number>();
  for (const inv of invoices) {
    if (!isBillable(inv)) continue;
    const key = inv.doc_date.slice(0, 10);
    totals.set(key, (totals.get(key) ?? 0) + Number(inv.total_amount));
  }

  const points: RevenueTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY_MS);
    const key = day.toISOString().slice(0, 10);
    points.push({
      date: key,
      label: day.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      total: totals.get(key) ?? 0,
    });
  }
  return points;
}

export function computeRevenueThisMonth(invoices: InvoiceListItem[]): number {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  return invoices
    .filter((inv) => isBillable(inv) && new Date(inv.doc_date) >= monthStart)
    .reduce((sum, inv) => sum + Number(inv.total_amount), 0);
}

export function computeOutstanding(invoices: InvoiceListItem[]): number {
  return invoices.filter((inv) => isBillable(inv)).reduce((sum, inv) => sum + Number(inv.balance_amount), 0);
}

/** Won / (won + lost) -- opportunities still open (new/estimate_scheduled/estimate_sent)
 * don't count either way yet. Null when nothing has closed, so the caller can show
 * "--" instead of a misleading 0%. */
export function computeOpportunityWinRate(opportunities: OpportunityListItem[]): number | null {
  const won = opportunities.filter((o) => o.status === "won").length;
  const lost = opportunities.filter((o) => o.status === "lost").length;
  const closed = won + lost;
  return closed === 0 ? null : Math.round((won / closed) * 100);
}
