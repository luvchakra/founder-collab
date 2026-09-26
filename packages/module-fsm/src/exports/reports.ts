// EXP-FSM-08 -- Service reports export: every report on /[businessSlug]/service/reports
// for the period its date-range selector (`?range=`) is set to, one sheet per report
// plus a Summary of the figures the page shows above each table. Customer balances and
// account aging are "as of today" snapshots on the page, and are here too.
//
// CSV is one table: the page's report tabs are client-side state (no URL parameter says
// which one is open), so CSV carries the page's default tab, Jobs completed. Excel
// carries all ten.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { resolveReportRange, type ReportRangePreset } from "../components/reports/date-range-control";
import type { AgingRow, CustomerBalanceRow, JobsCompletedRow, PaymentRow, ProductivityRow, RevenueByGroupRow, TimecardRow } from "../lib/reports/types";
import { PAYMENT_METHOD_LABEL, labelFor } from "./labels";
import {
  listBalanceReportsForExport,
  listJobsCompletedForExport,
  listPaymentsForExport,
  listRevenueReportsForExport,
  listTimeReportsForExport,
} from "./queries";

type Filters = { range: ReportRangePreset };

/** The page's own preset keys and labels (DateRangeControl). */
export const REPORT_RANGE_LABEL: Record<ReportRangePreset, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  month: "This month",
  year: "This year",
  all: "All time",
};

const AGING_BUCKETS: AgingRow["aging_bucket"][] = ["current", "1-30", "31-60", "61-90", "90+"];
const AGING_LABEL: Record<AgingRow["aging_bucket"], string> = {
  current: "Current",
  "1-30": "1-30 days",
  "31-60": "31-60 days",
  "61-90": "61-90 days",
  "90+": "90+ days",
};

type SummaryRow = { report: string; metric: string; period: string; count?: number | null; amount?: number | null; hours?: number | null };

const sum = <T>(rows: T[], value: (row: T) => number) => Math.round(rows.reduce((total, row) => total + value(row), 0) * 100) / 100;

function revenueSheet(sheetName: string, groupHeader: string, rows: RevenueByGroupRow[]) {
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const columns: ExportColumn<RevenueByGroupRow>[] = [
    { key: "group", header: groupHeader, getValue: (r) => r.label },
    { key: "revenue", header: "Revenue", type: "currency", currency: "INR", getValue: (r) => r.revenue },
    { key: "share", header: "% of total", type: "percent", getValue: (r) => (total > 0 ? r.revenue / total : null) },
  ];
  return { sheetName, columns, rows };
}

export const fsmReportsExport: ExportAdapter<Filters> = {
  id: "fsm.reports",
  module: "fsm",
  // The reports page checks no permission of its own -- the fsm licence (checked by the
  // runner) and business membership (RLS) are what reading it takes, balances included.
  permissions: [],
  parseFilters: (params) => {
    const range = params.get("range") as ReportRangePreset | null;
    return { range: range && Object.hasOwn(REPORT_RANGE_LABEL, range) ? range : "all" };
  },
  describeFilters: (f) => ({ Period: REPORT_RANGE_LABEL[f.range] }),
  async load(context, filters) {
    const range = resolveReportRange(filters.range);
    const [jobsCompleted, revenue, balances, payments, time] = await Promise.all([
      listJobsCompletedForExport(context.businessId, range),
      listRevenueReportsForExport(context.businessId, range),
      listBalanceReportsForExport(context.businessId),
      listPaymentsForExport(context.businessId, range),
      listTimeReportsForExport(context.businessId, range),
    ]);

    const period = range.from ? `${range.from} to ${range.to ?? ""}`.trim() : REPORT_RANGE_LABEL.all;
    const asOfToday = "As of today";
    const summary: SummaryRow[] = [
      { report: "Jobs completed", metric: "Jobs completed", period, count: jobsCompleted.length },
      { report: "Jobs completed", metric: "Total invoiced", period, amount: sum(jobsCompleted, (j) => j.invoiced_amount) },
      ...(
        [
          ["Revenue by service", revenue.byService],
          ["Revenue by tag", revenue.byTag],
          ["Revenue by charge type", revenue.byChargeType],
          ["Revenue by marketing source", revenue.byMarketingSource],
        ] as const
      ).flatMap(([report, rows]): SummaryRow[] => [
        { report, metric: "Total revenue", period, amount: sum([...rows], (r) => r.revenue) },
        { report, metric: "Groups", period, count: rows.length },
      ]),
      { report: "Customer balances", metric: "Total outstanding", period: asOfToday, amount: sum(balances.customerBalances, (c) => c.balance_amount) },
      { report: "Customer balances", metric: "Customers", period: asOfToday, count: balances.customerBalances.length },
      ...AGING_BUCKETS.map((bucket): SummaryRow => {
        const rows = balances.aging.filter((a) => a.aging_bucket === bucket);
        return { report: "Account aging", metric: AGING_LABEL[bucket], period: asOfToday, count: rows.length, amount: sum(rows, (a) => a.balance_amount) };
      }),
      { report: "Payments", metric: "Total collected", period, amount: sum(payments, (p) => p.amount) },
      { report: "Payments", metric: "Payments", period, count: payments.length },
      { report: "Timecards", metric: "Total hours", period, hours: sum(time.timecards, (t) => t.total_hours) },
      { report: "Timecards", metric: "Billable hours", period, hours: sum(time.timecards, (t) => t.billable_hours) },
      { report: "Productivity", metric: "Jobs completed", period, count: time.productivity.reduce((s, p) => s + p.jobs_completed, 0) },
      { report: "Productivity", metric: "Hours logged", period, hours: sum(time.productivity, (p) => p.total_hours) },
    ];

    return {
      module: "fsm",
      resource: "reports",
      title: "Service reports",
      csvSheet: "Jobs Completed",
      metadata: { Period: period, "Date range": REPORT_RANGE_LABEL[filters.range] },
      sheets: [
        {
          sheetName: "Summary",
          columns: [
            { key: "report", header: "Report", getValue: (s: SummaryRow) => s.report },
            { key: "metric", header: "Metric", getValue: (s: SummaryRow) => s.metric },
            { key: "period", header: "Period", getValue: (s: SummaryRow) => s.period },
            { key: "count", header: "Count", type: "integer", getValue: (s: SummaryRow) => s.count },
            { key: "amount", header: "Amount", type: "currency", currency: "INR", getValue: (s: SummaryRow) => s.amount },
            { key: "hours", header: "Hours", type: "number", getValue: (s: SummaryRow) => s.hours },
          ],
          rows: summary,
        },
        {
          sheetName: "Jobs Completed",
          columns: [
            { key: "number", header: "Job #", getValue: (j: JobsCompletedRow) => j.number },
            { key: "customer", header: "Customer", getValue: (j: JobsCompletedRow) => j.party_name },
            { key: "service", header: "Service type", getValue: (j: JobsCompletedRow) => j.service_type_name },
            { key: "completed", header: "Completed", type: "datetime", getValue: (j: JobsCompletedRow) => j.completed_at },
            { key: "invoiced", header: "Invoiced", type: "currency", currency: "INR", getValue: (j: JobsCompletedRow) => j.invoiced_amount },
          ],
          rows: jobsCompleted,
        },
        revenueSheet("Revenue by Service", "Service type", revenue.byService),
        revenueSheet("Revenue by Tag", "Tag", revenue.byTag),
        revenueSheet("Revenue by Charge Type", "Charge type", revenue.byChargeType),
        revenueSheet("Revenue by Marketing Source", "Marketing source", revenue.byMarketingSource),
        {
          sheetName: "Customer Balances",
          columns: [
            { key: "customer", header: "Customer", getValue: (c: CustomerBalanceRow) => c.party_name },
            { key: "balance", header: "Balance", type: "currency", currency: "INR", getValue: (c: CustomerBalanceRow) => c.balance_amount },
          ],
          rows: balances.customerBalances,
        },
        {
          sheetName: "Account Aging",
          columns: [
            { key: "number", header: "Invoice #", getValue: (a: AgingRow) => a.number },
            { key: "customer", header: "Customer", getValue: (a: AgingRow) => a.party_name },
            { key: "due", header: "Due date", type: "date", getValue: (a: AgingRow) => a.due_date },
            { key: "days", header: "Days overdue", type: "integer", getValue: (a: AgingRow) => a.days_overdue },
            { key: "bucket", header: "Bucket", getValue: (a: AgingRow) => AGING_LABEL[a.aging_bucket] },
            { key: "balance", header: "Balance", type: "currency", currency: "INR", getValue: (a: AgingRow) => a.balance_amount },
          ],
          rows: balances.aging,
        },
        {
          sheetName: "Payments",
          columns: [
            { key: "date", header: "Date", type: "date", getValue: (p: PaymentRow) => p.payment_date },
            { key: "customer", header: "Customer", getValue: (p: PaymentRow) => p.party_name },
            { key: "method", header: "Method", getValue: (p: PaymentRow) => labelFor(PAYMENT_METHOD_LABEL, p.method) },
            { key: "reference", header: "Reference", getValue: (p: PaymentRow) => p.reference },
            { key: "amount", header: "Amount", type: "currency", currency: "INR", getValue: (p: PaymentRow) => p.amount },
          ],
          rows: payments,
        },
        {
          sheetName: "Timecards",
          columns: [
            { key: "employee", header: "Employee", getValue: (t: TimecardRow) => t.employee_name },
            { key: "total", header: "Total hours", type: "number", getValue: (t: TimecardRow) => t.total_hours },
            { key: "billable", header: "Billable hours", type: "number", getValue: (t: TimecardRow) => t.billable_hours },
            { key: "entries", header: "Entries", type: "integer", getValue: (t: TimecardRow) => t.entry_count },
          ],
          rows: time.timecards,
        },
        {
          sheetName: "Productivity",
          columns: [
            { key: "employee", header: "Employee", getValue: (p: ProductivityRow) => p.employee_name },
            { key: "jobs", header: "Jobs completed", type: "integer", getValue: (p: ProductivityRow) => p.jobs_completed },
            { key: "hours", header: "Hours logged", type: "number", getValue: (p: ProductivityRow) => p.total_hours },
          ],
          rows: time.productivity,
        },
      ],
    };
  },
};
