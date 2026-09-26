import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { EmployeeOption } from "../lib/employees/types";
import type { ScheduleEventItem } from "../lib/events/types";
import type { EventDetails, OwnTimeEntryRow } from "./queries";

// EXP-FSM-07 -- My Day export: the signed-in technician's own day, never anyone else's.

const state = vi.hoisted(() => ({
  employee: null as unknown,
  events: [] as unknown[],
  entries: [] as unknown[],
  details: new Map<string, unknown>(),
}));
const getCurrentEmployee = vi.hoisted(() => vi.fn(async () => state.employee));
const listMyEventsForRange = vi.hoisted(() => vi.fn(async () => state.events));
const listOwnTimeEntriesForExport = vi.hoisted(() => vi.fn(async () => state.entries));
const describeEventsForExport = vi.hoisted(() => vi.fn(async () => state.details));
vi.mock("../lib/employees/queries", () => ({ getCurrentEmployee }));
vi.mock("../lib/events/queries", () => ({ listMyEventsForRange }));
vi.mock("./queries", () => ({ listOwnTimeEntriesForExport, describeEventsForExport }));

import { ExportDeniedError } from "@cofounderai/core/exports/server";
import { fsmMyDayExport, myDayRange } from "./my-day";

const context: ExportContext = {
  businessId: "biz-a",
  businessSlug: "acme",
  businessName: "Acme Services",
  timeZone: "Asia/Kolkata",
  userId: "user-me",
  userEmail: "tech@example.com",
  format: "csv",
  scope: "view",
};

async function csv(workbook: ExportWorkbookDefinition, sheet?: string): Promise<string[]> {
  const file = await renderExport({ ...workbook, csvSheet: sheet }, "csv", { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

const me: EmployeeOption = { id: "emp-me", user_id: "user-me", full_name: "Ravi", email: "tech@example.com", job_title: null };

const event: ScheduleEventItem = {
  id: "ev-1",
  business_id: "biz-a",
  kind: "work",
  job_id: "job-1",
  opportunity_id: null,
  starts_at: "2026-09-26T04:30:00Z",
  ends_at: "2026-09-26T06:30:00Z",
  all_day: false,
  description: null,
  status: "arrived",
  arrival_window_start: "2026-09-26T04:00:00Z",
  arrival_window_end: "2026-09-26T05:00:00Z",
  created_by: "user-9",
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  assignee_employee_ids: ["emp-me"],
  subject_label: "JOB-1",
  party_name: "Asha Traders",
};

const entry = (overrides: Partial<OwnTimeEntryRow>): OwnTimeEntryRow => ({
  id: "t1",
  job_id: "job-1",
  started_at: "2026-09-26T04:35:00Z",
  ended_at: "2026-09-26T05:05:00Z",
  duration_minutes: 30,
  is_billable: true,
  notes: null,
  job_number: "JOB-1",
  customer: "Asha Traders",
  ...overrides,
});

beforeEach(() => {
  state.employee = me;
  state.events = [event, { ...event, id: "ev-2", job_id: null, opportunity_id: "opp-1", kind: "estimate", subject_label: "OPP-1", status: "scheduled" }];
  state.entries = [entry({}), entry({ id: "t2", started_at: "2026-09-26T05:10:00Z", ended_at: null, duration_minutes: null })];
  state.details = new Map<string, EventDetails>([["ev-1", { technician_names: ["Ravi"], location: "Site 4, Pune", job_completed_at: null }]]);
  vi.clearAllMocks();
});

describe("fsm.my-day (EXP-FSM-07)", () => {
  it("is licence-gated with the page's own (empty) permission set and reads no request filters", () => {
    expect(fsmMyDayExport).toMatchObject({ id: "fsm.my-day", module: "fsm", permissions: [] });
    expect(fsmMyDayExport.parseFilters!(new URLSearchParams("employeeId=emp-other&userId=user-other&businessId=biz-b"))).toEqual({});
  });

  it("requests only the signed-in technician's events and time entries, for today, in the resolved business", async () => {
    const range = myDayRange();
    await fsmMyDayExport.load(context, fsmMyDayExport.parseFilters!(new URLSearchParams("employeeId=emp-other")));
    expect(getCurrentEmployee).toHaveBeenCalledWith("biz-a");
    expect(listMyEventsForRange).toHaveBeenCalledTimes(1);
    expect(listMyEventsForRange).toHaveBeenCalledWith("biz-a", "emp-me", range.start, range.end);
    expect(listOwnTimeEntriesForExport).toHaveBeenCalledTimes(1);
    expect(listOwnTimeEntriesForExport).toHaveBeenCalledWith("biz-a", "emp-me", range.start, range.end);
  });

  it("uses the page's own 'today' window", () => {
    const now = new Date("2026-09-26T06:00:00Z");
    expect(myDayRange(now)).toEqual({
      day: "2026-09-26",
      start: new Date("2026-09-26T00:00:00").toISOString(),
      end: new Date(new Date("2026-09-26T00:00:00").getTime() + 86_400_000).toISOString(),
    });
  });

  it("refuses a user who isn't a technician here, reading nothing", async () => {
    state.employee = null;
    await expect(fsmMyDayExport.load(context, {})).rejects.toBeInstanceOf(ExportDeniedError);
    expect(listMyEventsForRange).not.toHaveBeenCalled();
    expect(listOwnTimeEntriesForExport).not.toHaveBeenCalled();
  });

  it("refuses an employee row that isn't the session user's own", async () => {
    state.employee = { ...me, user_id: "user-other" };
    await expect(fsmMyDayExport.load(context, {})).rejects.toBeInstanceOf(ExportDeniedError);
    expect(listMyEventsForRange).not.toHaveBeenCalled();
  });

  it("writes the day with arrival window, status, completion and logged time", async () => {
    const workbook = await fsmMyDayExport.load(context, {});
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["My Day", "Time entries"]);
    expect(workbook.metadata).toMatchObject({ Technician: "Ravi" });
    const [header, first, second] = await csv(workbook);
    expect(header).toBe(
      "Job / opportunity #,Event,Customer,Location,Scheduled start,Scheduled end,Arrival window start,Arrival window end,Status,Job completed,Clocked in,Clocked out,Time logged (min)",
    );
    expect(first).toBe(
      "JOB-1,Work,Asha Traders,\"Site 4, Pune\",2026-09-26T10:00:00+05:30,2026-09-26T12:00:00+05:30,2026-09-26T09:30:00+05:30,2026-09-26T10:30:00+05:30,Arrived,,2026-09-26T10:05:00+05:30,,30",
    );
    // An opportunity visit has no job, so no time entries: every time column stays blank.
    expect(second).toBe("OPP-1,Estimate visit,Asha Traders,,2026-09-26T10:00:00+05:30,2026-09-26T12:00:00+05:30,2026-09-26T09:30:00+05:30,2026-09-26T10:30:00+05:30,Scheduled,,,,");

    const entries = await csv(workbook, "Time entries");
    expect(entries).toEqual([
      "Job #,Customer,Clocked in,Clocked out,Minutes,Billable,Notes",
      "JOB-1,Asha Traders,2026-09-26T10:05:00+05:30,2026-09-26T10:35:00+05:30,30,Yes,",
      "JOB-1,Asha Traders,2026-09-26T10:40:00+05:30,,,Yes,",
    ]);
  });
});
