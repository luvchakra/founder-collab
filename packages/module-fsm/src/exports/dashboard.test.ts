import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { ScheduleEventItem } from "../lib/events/types";
import type { InvoiceListItem } from "../lib/invoices/types";
import type { JobListItem } from "../lib/jobs/types";
import type { OpportunityListItem } from "../lib/opportunities/types";
import type { EventDetails } from "./queries";

// EXP-FSM-01 -- Service dashboard export: the numbers behind the dashboard, one sheet each.

const state = vi.hoisted(() => ({
  events: [] as unknown[],
  jobs: [] as unknown[],
  invoices: [] as unknown[],
  opportunities: [] as unknown[],
  details: new Map<string, unknown>(),
}));
const listEventsForRange = vi.hoisted(() => vi.fn(async () => state.events));
const listJobRowsForExport = vi.hoisted(() => vi.fn(async () => state.jobs));
const listInvoicesForExport = vi.hoisted(() => vi.fn(async () => state.invoices));
const listOpportunityRowsForExport = vi.hoisted(() => vi.fn(async () => state.opportunities));
const describeEventsForExport = vi.hoisted(() => vi.fn(async () => state.details));
vi.mock("../lib/events/queries", () => ({ listEventsForRange }));
vi.mock("./queries", () => ({ listJobRowsForExport, listInvoicesForExport, listOpportunityRowsForExport, describeEventsForExport }));

import { dashboardScheduleWindow, fsmDashboardExport } from "./dashboard";

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
  const file = await renderExport({ ...workbook, csvSheet: sheet }, "csv", { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

const job = (id: string, status: JobListItem["status"]) =>
  ({ id, number: id.toUpperCase(), status, party_name: "Asha Traders", service_type_name: null, started_at: null, created_at: "2026-09-01T04:30:00Z" }) as JobListItem;
const invoice = (id: string, overrides: Partial<InvoiceListItem>) =>
  ({ id, number: id.toUpperCase(), status: "issued", doc_date: "2020-01-01", due_date: "2020-01-15", party_name: "Asha Traders", total_amount: 100, balance_amount: 100, ...overrides }) as InvoiceListItem;
const opportunity = (id: string, status: OpportunityListItem["status"]) =>
  ({ id, number: id.toUpperCase(), status, party_name: "Asha Traders", service_type_name: null, updated_at: "2026-09-20T04:30:00Z" }) as OpportunityListItem;

beforeEach(() => {
  state.jobs = [job("j1", "unscheduled"), job("j2", "in_progress"), job("j3", "completed"), job("j4", "cancelled")];
  state.invoices = [invoice("i1", {}), invoice("i2", { status: "paid", balance_amount: 0 }), invoice("i3", { status: "draft", due_date: null })];
  state.opportunities = [opportunity("o1", "won"), opportunity("o2", "lost"), opportunity("o3", "won"), opportunity("o4", "estimate_sent")];
  state.events = [
    { id: "ev-1", kind: "work", status: "done", subject_label: "J2", party_name: "Asha Traders", starts_at: "2026-09-26T04:30:00Z", ends_at: null },
    { id: "ev-2", kind: "estimate", status: "scheduled", subject_label: "O4", party_name: "Asha Traders", starts_at: "2026-09-26T08:30:00Z", ends_at: null },
  ] as ScheduleEventItem[];
  state.details = new Map<string, EventDetails>([
    ["ev-1", { technician_names: ["Ravi"], location: "Pune", job_completed_at: null }],
    ["ev-2", { technician_names: [], location: null, job_completed_at: null }],
  ]);
  vi.clearAllMocks();
});

describe("fsm.dashboard (EXP-FSM-01)", () => {
  it("is licence-gated with the page's own (empty) permission set", () => {
    expect(fsmDashboardExport).toMatchObject({ id: "fsm.dashboard", module: "fsm", permissions: [] });
  });

  it("takes only the page's own range selector", () => {
    expect(fsmDashboardExport.parseFilters!(new URLSearchParams("range=week&businessId=biz-b"))).toEqual({ range: "week" });
    expect(fsmDashboardExport.parseFilters!(new URLSearchParams("range=year"))).toEqual({ range: "today" });
  });

  it("reads the resolved business's data and the page's schedule window", async () => {
    await fsmDashboardExport.load(context, { range: "week" });
    const window = dashboardScheduleWindow("week");
    expect(listEventsForRange).toHaveBeenCalledWith("biz-a", window.start, window.end);
    for (const fn of [listJobRowsForExport, listInvoicesForExport, listOpportunityRowsForExport]) expect(fn).toHaveBeenCalledWith("biz-a");
    const today = dashboardScheduleWindow("today", new Date("2026-09-26T20:00:00Z"));
    expect(today).toEqual({ start: "2026-09-26T00:00:00.000Z", end: "2026-09-27T00:00:00.000Z", todayIso: "2026-09-26" });
  });

  it("has one sheet per dataset, Summary first (the CSV)", async () => {
    const workbook = await fsmDashboardExport.load(context, { range: "today" });
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual([
      "Summary",
      "Jobs",
      "Revenue",
      "Technician",
      "Schedule",
      "Unassigned queue",
      "Jobs in progress",
      "Overdue invoices",
      "Estimates awaiting",
    ]);
    const summary = await csv(workbook);
    expect(summary[0]).toBe("Metric,Count,Amount,Rate,Note");
    expect(summary).toContain("Open jobs,2,,,");
    expect(summary).toContain("Overdue invoices,1,,,");
    expect(summary).toContain("Outstanding,,100,,\"Unpaid balance, excluding drafts and voided invoices\"");
    expect(summary).toContain("Win rate,,,0.67,Won / (won + lost)");
    expect(summary).toContain("Scheduled events (today),2,,,");
  });

  it("keeps an undecided win rate blank, never 0%", async () => {
    state.opportunities = [opportunity("o4", "estimate_sent")];
    const summary = await csv(await fsmDashboardExport.load(context, { range: "today" }));
    expect(summary).toContain("Win rate,,,,Won / (won + lost)");
  });

  it("writes labels in the job, technician and queue sheets", async () => {
    const workbook = await fsmDashboardExport.load(context, { range: "today" });
    expect(await csv(workbook, "Jobs")).toEqual(["Status,Jobs", "Unscheduled,1", "Scheduled,0", "In progress,1", "On hold,0", "Completed,1", "Cancelled,1"]);
    expect(await csv(workbook, "Technician")).toEqual([
      "Technician,Scheduled events,Work visits,Estimate visits,Reminders,Done,Cancelled",
      "Ravi,1,1,0,0,1,0",
      "Unassigned,1,0,1,0,0,0",
    ]);
    const schedule = await csv(workbook, "Schedule");
    expect(schedule[1]).toBe("Work,J2,Asha Traders,Ravi,2026-09-26T10:00:00+05:30,,Done,Pune");
    expect(await csv(workbook, "Unassigned queue")).toEqual(["Job #,Customer,Service type,Status,Started,Created", "J1,Asha Traders,,Unscheduled,,2026-09-01T10:00:00+05:30"]);
    expect((await csv(workbook, "Overdue invoices"))[1]).toBe("I1,Asha Traders,Issued,2020-01-15,100,100");
    expect((await csv(workbook, "Estimates awaiting"))[1]).toBe("O4,Asha Traders,,Estimate Sent,2026-09-20T10:00:00+05:30");
    expect(await csv(workbook, "Revenue")).toHaveLength(31);
  });
});
