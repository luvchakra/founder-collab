// EXP-FSM-01 -- Service dashboard export: the numbers behind every card and chart on
// /[businessSlug]/service, one sheet per dataset (Summary, Jobs, Revenue, Technician,
// Schedule, plus the four action queues the dashboard lists).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import {
  buildJobStatusBreakdown,
  buildRevenueTrend,
  computeOpportunityWinRate,
  computeOutstanding,
  computeRevenueThisMonth,
} from "../lib/dashboard/aggregate";
import { listEventsForRange } from "../lib/events/queries";
import type { ScheduleEventItem } from "../lib/events/types";
import { EVENT_KIND_LABEL, EVENT_STATUS_LABEL, INVOICE_STATUS_LABEL, JOB_STATUS_LABEL, OPPORTUNITY_STATUS_LABEL, labelFor } from "./labels";
import { describeEventsForExport, listInvoicesForExport, listJobRowsForExport, listOpportunityRowsForExport, type EventDetails } from "./queries";
import type { InvoiceListItem } from "../lib/invoices/types";
import type { JobListItem } from "../lib/jobs/types";
import type { OpportunityListItem } from "../lib/opportunities/types";

type Filters = { range: "today" | "week" };

/** One KPI: exactly one of count / amount / rate is set, so each column keeps one type. */
type Metric = { metric: string; count?: number | null; amount?: number | null; rate?: number | null; note?: string };

type TechnicianLoad = { technician: string; events: number; work: number; estimate: number; reminder: number; done: number; cancelled: number };

/** The schedule window, computed exactly as dashboard/queries.ts#getDispatcherDashboard
 * does: today (UTC day) or the next 7 days from it. */
export function dashboardScheduleWindow(range: Filters["range"], now = new Date()): { start: string; end: string; todayIso: string } {
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const scheduleEnd = new Date(todayStart);
  scheduleEnd.setUTCDate(scheduleEnd.getUTCDate() + (range === "week" ? 7 : 1));
  return { start: todayStart.toISOString(), end: scheduleEnd.toISOString(), todayIso: todayStart.toISOString().slice(0, 10) };
}

function technicianLoad(events: ScheduleEventItem[], details: Map<string, EventDetails>): TechnicianLoad[] {
  const byName = new Map<string, TechnicianLoad>();
  const bump = (name: string, e: ScheduleEventItem) => {
    const row = byName.get(name) ?? { technician: name, events: 0, work: 0, estimate: 0, reminder: 0, done: 0, cancelled: 0 };
    row.events += 1;
    row[e.kind] += 1;
    if (e.status === "done") row.done += 1;
    if (e.status === "cancelled") row.cancelled += 1;
    byName.set(name, row);
  };
  for (const e of events) {
    const names = details.get(e.id)?.technician_names ?? [];
    if (names.length === 0) bump("Unassigned", e);
    for (const name of names) bump(name, e);
  }
  return [...byName.values()].sort((a, b) => b.events - a.events || a.technician.localeCompare(b.technician));
}

const jobQueueColumns: ExportColumn<JobListItem>[] = [
  { key: "number", header: "Job #", getValue: (j) => j.number },
  { key: "customer", header: "Customer", getValue: (j) => j.party_name },
  { key: "service", header: "Service type", getValue: (j) => j.service_type_name },
  { key: "status", header: "Status", getValue: (j) => labelFor(JOB_STATUS_LABEL, j.status) },
  { key: "started", header: "Started", type: "datetime", getValue: (j) => j.started_at },
  { key: "created", header: "Created", type: "datetime", getValue: (j) => j.created_at },
];

export const fsmDashboardExport: ExportAdapter<Filters> = {
  id: "fsm.dashboard",
  module: "fsm",
  // The dashboard page checks no permission of its own -- reading it takes the fsm
  // licence (checked by the runner) and business membership (RLS). Nothing to add here.
  permissions: [],
  parseFilters: (params) => ({ range: params.get("range") === "week" ? "week" : "today" }),
  describeFilters: (f) => ({ Schedule: f.range === "week" ? "This week" : "Today" }),
  async load(context, filters) {
    const window = dashboardScheduleWindow(filters.range);
    // Same datasets getDispatcherDashboard() reads, each without the 1,000-row cap.
    const [events, jobs, invoices, opportunities] = await Promise.all([
      listEventsForRange(context.businessId, window.start, window.end),
      listJobRowsForExport(context.businessId),
      listInvoicesForExport(context.businessId),
      listOpportunityRowsForExport(context.businessId),
    ]);
    const details = await describeEventsForExport(events);

    const unassignedJobs = jobs.filter((j) => j.status === "unscheduled");
    const jobsInProgress = jobs.filter((j) => j.status === "in_progress");
    const overdueInvoices = invoices.filter(
      (i) => i.status !== "voided" && i.status !== "paid" && i.due_date !== null && i.due_date < window.todayIso && i.balance_amount > 0,
    );
    const estimatesAwaiting = opportunities.filter((o) => o.status === "estimate_sent");
    const winRate = computeOpportunityWinRate(opportunities);
    const scheduleLabel = filters.range === "week" ? "Scheduled events (this week)" : "Scheduled events (today)";

    const summary: Metric[] = [
      { metric: "Open jobs", count: jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled").length },
      { metric: "Jobs in progress", count: jobsInProgress.length },
      { metric: "Unassigned jobs", count: unassignedJobs.length },
      { metric: "Revenue (this month)", amount: computeRevenueThisMonth(invoices), note: "Invoiced, excluding drafts and voided invoices" },
      { metric: "Outstanding", amount: computeOutstanding(invoices), note: "Unpaid balance, excluding drafts and voided invoices" },
      { metric: "Overdue invoices", count: overdueInvoices.length },
      // Blank, not 0%, when nothing has been won or lost yet -- as the dashboard shows "--".
      { metric: "Win rate", rate: winRate === null ? null : winRate / 100, note: "Won / (won + lost)" },
      { metric: "Estimates awaiting response", count: estimatesAwaiting.length },
      { metric: scheduleLabel, count: events.length },
    ];

    return {
      module: "fsm",
      resource: "dashboard",
      title: "Service dashboard",
      metadata: { Schedule: filters.range === "week" ? "This week" : "Today" },
      sheets: [
        {
          sheetName: "Summary",
          columns: [
            { key: "metric", header: "Metric", getValue: (m: Metric) => m.metric },
            { key: "count", header: "Count", type: "integer", getValue: (m: Metric) => m.count },
            { key: "amount", header: "Amount", type: "currency", currency: "INR", getValue: (m: Metric) => m.amount },
            { key: "rate", header: "Rate", type: "percent", getValue: (m: Metric) => m.rate },
            { key: "note", header: "Note", getValue: (m: Metric) => m.note },
          ],
          rows: summary,
        },
        {
          sheetName: "Jobs",
          columns: [
            { key: "status", header: "Status", getValue: (b: { label: string }) => b.label },
            { key: "jobs", header: "Jobs", type: "integer", getValue: (b: { value: number }) => b.value },
          ],
          rows: buildJobStatusBreakdown(jobs),
        },
        {
          sheetName: "Revenue",
          columns: [
            { key: "date", header: "Date", type: "date", getValue: (p: { date: string }) => p.date },
            { key: "invoiced", header: "Invoiced", type: "currency", currency: "INR", getValue: (p: { total: number }) => p.total },
          ],
          rows: buildRevenueTrend(invoices),
        },
        {
          sheetName: "Technician",
          columns: [
            { key: "technician", header: "Technician", getValue: (t: TechnicianLoad) => t.technician },
            { key: "events", header: "Scheduled events", type: "integer", getValue: (t: TechnicianLoad) => t.events },
            { key: "work", header: "Work visits", type: "integer", getValue: (t: TechnicianLoad) => t.work },
            { key: "estimate", header: "Estimate visits", type: "integer", getValue: (t: TechnicianLoad) => t.estimate },
            { key: "reminder", header: "Reminders", type: "integer", getValue: (t: TechnicianLoad) => t.reminder },
            { key: "done", header: "Done", type: "integer", getValue: (t: TechnicianLoad) => t.done },
            { key: "cancelled", header: "Cancelled", type: "integer", getValue: (t: TechnicianLoad) => t.cancelled },
          ],
          rows: technicianLoad(events, details),
        },
        {
          sheetName: "Schedule",
          columns: [
            { key: "event", header: "Event", getValue: (e: ScheduleEventItem) => labelFor(EVENT_KIND_LABEL, e.kind) },
            { key: "subject", header: "Job / opportunity #", getValue: (e: ScheduleEventItem) => e.subject_label },
            { key: "customer", header: "Customer", getValue: (e: ScheduleEventItem) => e.party_name },
            { key: "technician", header: "Technician", getValue: (e: ScheduleEventItem) => details.get(e.id)?.technician_names ?? [] },
            { key: "start", header: "Start", type: "datetime", getValue: (e: ScheduleEventItem) => e.starts_at },
            { key: "end", header: "End", type: "datetime", getValue: (e: ScheduleEventItem) => e.ends_at },
            { key: "status", header: "Status", getValue: (e: ScheduleEventItem) => labelFor(EVENT_STATUS_LABEL, e.status) },
            { key: "location", header: "Location", getValue: (e: ScheduleEventItem) => details.get(e.id)?.location },
          ],
          rows: events,
        },
        { sheetName: "Unassigned queue", columns: jobQueueColumns, rows: unassignedJobs },
        { sheetName: "Jobs in progress", columns: jobQueueColumns, rows: jobsInProgress },
        {
          sheetName: "Overdue invoices",
          columns: [
            { key: "number", header: "Invoice #", getValue: (i: InvoiceListItem) => i.number },
            { key: "customer", header: "Customer", getValue: (i: InvoiceListItem) => i.party_name },
            { key: "status", header: "Status", getValue: (i: InvoiceListItem) => labelFor(INVOICE_STATUS_LABEL, i.status) },
            { key: "due", header: "Due date", type: "date", getValue: (i: InvoiceListItem) => i.due_date },
            { key: "total", header: "Total", type: "currency", currency: "INR", getValue: (i: InvoiceListItem) => i.total_amount },
            { key: "balance", header: "Balance", type: "currency", currency: "INR", getValue: (i: InvoiceListItem) => i.balance_amount },
          ],
          rows: overdueInvoices,
        },
        {
          sheetName: "Estimates awaiting",
          columns: [
            { key: "number", header: "Opportunity #", getValue: (o: OpportunityListItem) => o.number },
            { key: "customer", header: "Customer", getValue: (o: OpportunityListItem) => o.party_name },
            { key: "service", header: "Service type", getValue: (o: OpportunityListItem) => o.service_type_name },
            { key: "status", header: "Status", getValue: (o: OpportunityListItem) => labelFor(OPPORTUNITY_STATUS_LABEL, o.status) },
            { key: "sent", header: "Sent", type: "datetime", getValue: (o: OpportunityListItem) => o.updated_at },
          ],
          rows: estimatesAwaiting,
        },
      ],
    };
  },
};
