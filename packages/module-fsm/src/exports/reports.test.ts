import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import { resolveReportRange } from "../components/reports/date-range-control";

// EXP-FSM-08 -- Service reports export: one workbook, every report, the selector's period.

const state = vi.hoisted(() => ({
  jobsCompleted: [] as unknown[],
  revenue: { byService: [], byTag: [], byChargeType: [], byMarketingSource: [] } as Record<string, unknown[]>,
  balances: { customerBalances: [], aging: [] } as Record<string, unknown[]>,
  payments: [] as unknown[],
  time: { timecards: [], productivity: [] } as Record<string, unknown[]>,
}));
const listJobsCompletedForExport = vi.hoisted(() => vi.fn(async () => state.jobsCompleted));
const listRevenueReportsForExport = vi.hoisted(() => vi.fn(async () => state.revenue));
const listBalanceReportsForExport = vi.hoisted(() => vi.fn(async () => state.balances));
const listPaymentsForExport = vi.hoisted(() => vi.fn(async () => state.payments));
const listTimeReportsForExport = vi.hoisted(() => vi.fn(async () => state.time));
vi.mock("./queries", () => ({
  listJobsCompletedForExport,
  listRevenueReportsForExport,
  listBalanceReportsForExport,
  listPaymentsForExport,
  listTimeReportsForExport,
}));

import { fsmReportsExport } from "./reports";

const context: ExportContext = {
  businessId: "biz-a",
  businessSlug: "acme",
  businessName: "Acme Services",
  timeZone: "Asia/Kolkata",
  userId: "user-1",
  userEmail: "owner@example.com",
  format: "xlsx",
  scope: "view",
};

async function csv(workbook: ExportWorkbookDefinition, sheet?: string): Promise<string[]> {
  const file = await renderExport(sheet ? { ...workbook, csvSheet: sheet } : workbook, "csv", {
    timeZone: context.timeZone,
    generatedAt: new Date("2026-09-26T06:00:00Z"),
  });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

beforeEach(() => {
  state.jobsCompleted = [
    { id: "j1", number: "JOB-1", party_name: "Asha Traders", service_type_name: "AC service", completed_at: "2026-09-10T04:30:00Z", invoiced_amount: 400 },
    { id: "j2", number: null, party_name: "Zen Clinic", service_type_name: null, completed_at: "2026-09-11T04:30:00Z", invoiced_amount: 0 },
  ];
  state.revenue = {
    byService: [
      { label: "AC service", revenue: 300 },
      { label: "Unspecified", revenue: 100 },
    ],
    byTag: [{ label: "Untagged", revenue: 400 }],
    byChargeType: [],
    byMarketingSource: [{ label: "Unattributed", revenue: 400 }],
  };
  state.balances = {
    customerBalances: [{ party_id: "party-1", party_name: "Asha Traders", balance_amount: 120 }],
    aging: [{ document_id: "doc-1", party_name: "Asha Traders", number: "INV-1", due_date: "2026-08-10", days_overdue: 47, balance_amount: 120, aging_bucket: "31-60" }],
  };
  state.payments = [{ id: "p1", party_name: "Asha Traders", method: "card_offline", amount: 250, payment_date: "2026-09-12", reference: "=cmd|x", document_id: "doc-1" }];
  state.time = {
    timecards: [{ employee_name: "Ravi", total_hours: 2.5, billable_hours: 2, entry_count: 3 }],
    productivity: [{ employee_name: "Ravi", jobs_completed: 1, total_hours: 2.5 }],
  };
  vi.clearAllMocks();
});

describe("fsm.reports (EXP-FSM-08)", () => {
  it("is licence-gated with the page's own (empty) permission set", () => {
    expect(fsmReportsExport).toMatchObject({ id: "fsm.reports", module: "fsm", permissions: [] });
  });

  it("takes only the page's own range presets, defaulting to all time as the page does", () => {
    const parse = (q: string) => fsmReportsExport.parseFilters!(new URLSearchParams(q));
    expect(parse("range=30d&businessId=biz-b")).toEqual({ range: "30d" });
    expect(parse("range=toString")).toEqual({ range: "all" });
    expect(parse("")).toEqual({ range: "all" });
    expect(fsmReportsExport.describeFilters!({ range: "month" })).toEqual({ Period: "This month" });
  });

  it("runs every report for the resolved business and the selector's date range", async () => {
    await fsmReportsExport.load(context, { range: "90d" });
    const range = resolveReportRange("90d");
    expect(range.from).toBeTruthy();
    for (const fn of [listJobsCompletedForExport, listRevenueReportsForExport, listPaymentsForExport, listTimeReportsForExport]) {
      expect(fn).toHaveBeenCalledWith("biz-a", range);
    }
    // Balances and aging are "as of today" snapshots on the page, not period reports.
    expect(listBalanceReportsForExport).toHaveBeenCalledWith("biz-a");
  });

  it("builds the story's workbook, with Jobs Completed (the page's default tab) as the CSV", async () => {
    const workbook = await fsmReportsExport.load(context, { range: "all" });
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual([
      "Summary",
      "Jobs Completed",
      "Revenue by Service",
      "Revenue by Tag",
      "Revenue by Charge Type",
      "Revenue by Marketing Source",
      "Customer Balances",
      "Account Aging",
      "Payments",
      "Timecards",
      "Productivity",
    ]);
    expect(workbook.csvSheet).toBe("Jobs Completed");
    expect(workbook.metadata).toEqual({ Period: "All time", "Date range": "All time" });
    expect(await csv(workbook)).toEqual([
      "Job #,Customer,Service type,Completed,Invoiced",
      "JOB-1,Asha Traders,AC service,2026-09-10T10:00:00+05:30,400",
      ",Zen Clinic,,2026-09-11T10:00:00+05:30,0",
    ]);
  });

  it("summarises each report with typed counts, amounts and hours", async () => {
    const summary = await csv(await fsmReportsExport.load(context, { range: "all" }), "Summary");
    expect(summary[0]).toBe("Report,Metric,Period,Count,Amount,Hours");
    expect(summary).toContain("Jobs completed,Jobs completed,All time,2,,");
    expect(summary).toContain("Jobs completed,Total invoiced,All time,,400,");
    expect(summary).toContain("Revenue by service,Total revenue,All time,,400,");
    expect(summary).toContain("Revenue by charge type,Groups,All time,0,,");
    expect(summary).toContain("Customer balances,Total outstanding,As of today,,120,");
    expect(summary).toContain("Account aging,31-60 days,As of today,1,120,");
    expect(summary).toContain("Account aging,90+ days,As of today,0,0,");
    expect(summary).toContain("Payments,Total collected,All time,,250,");
    expect(summary).toContain("Timecards,Billable hours,All time,,,2");
  });

  it("writes revenue shares as fractions, labels for codes, and neutralises formula text", async () => {
    const workbook = await fsmReportsExport.load(context, { range: "all" });
    expect(await csv(workbook, "Revenue by Service")).toEqual(["Service type,Revenue,% of total", "AC service,300,0.75", "Unspecified,100,0.25"]);
    expect(await csv(workbook, "Revenue by Charge Type")).toEqual(["Charge type,Revenue,% of total"]);
    expect(await csv(workbook, "Account Aging")).toEqual(["Invoice #,Customer,Due date,Days overdue,Bucket,Balance", "INV-1,Asha Traders,2026-08-10,47,31-60 days,120"]);
    expect(await csv(workbook, "Payments")).toEqual(["Date,Customer,Method,Reference,Amount", "2026-09-12,Asha Traders,Card (offline),'=cmd|x,250"]);
    expect(await csv(workbook, "Timecards")).toEqual(["Employee,Total hours,Billable hours,Entries", "Ravi,2.5,2,3"]);
    expect(await csv(workbook, "Productivity")).toEqual(["Employee,Jobs completed,Hours logged", "Ravi,1,2.5"]);
    const everything = (await Promise.all(workbook.sheets.map((s) => csv(workbook, s.sheetName)))).flat().join("\n");
    expect(everything).not.toMatch(/doc-1|party-1|\bj1\b|\bp1\b/);
  });
});
