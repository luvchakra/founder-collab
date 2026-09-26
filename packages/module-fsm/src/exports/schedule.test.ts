import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { ScheduleEventItem } from "../lib/events/types";
import type { EventDetails } from "./queries";

// EXP-FSM-06 -- Service schedule export: the page's selected day or week.

const state = vi.hoisted(() => ({ events: [] as unknown[], details: new Map<string, unknown>() }));
const listEventsForRange = vi.hoisted(() => vi.fn(async () => state.events));
const describeEventsForExport = vi.hoisted(() => vi.fn(async () => state.details));
vi.mock("../lib/events/queries", () => ({ listEventsForRange }));
vi.mock("./queries", () => ({ describeEventsForExport }));

import { fsmScheduleExport, scheduleRange } from "./schedule";

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

async function csv(workbook: ExportWorkbookDefinition): Promise<string[]> {
  const file = await renderExport(workbook, "csv", { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

const event = (overrides: Partial<ScheduleEventItem>): ScheduleEventItem => ({
  id: "ev-1",
  business_id: "biz-a",
  kind: "work",
  job_id: "job-1",
  opportunity_id: null,
  starts_at: "2026-09-24T04:30:00Z",
  ends_at: "2026-09-24T06:30:00Z",
  all_day: false,
  description: null,
  status: "en_route",
  arrival_window_start: "2026-09-24T04:00:00Z",
  arrival_window_end: null,
  created_by: "user-9",
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
  assignee_employee_ids: ["emp-1"],
  subject_label: "JOB-1",
  party_name: "Asha Traders",
  ...overrides,
});

beforeEach(() => {
  state.events = [
    event({}),
    event({ id: "ev-2", kind: "estimate", job_id: null, opportunity_id: "opp-1", subject_label: "OPP-1", status: "scheduled", ends_at: null, arrival_window_start: null, assignee_employee_ids: [] }),
  ];
  state.details = new Map<string, EventDetails>([
    ["ev-1", { technician_names: ["Ravi", "Meena"], location: "Site 4, Pune", job_completed_at: null }],
    ["ev-2", { technician_names: [], location: null, job_completed_at: null }],
  ]);
  listEventsForRange.mockClear();
});

describe("fsm.schedule (EXP-FSM-06)", () => {
  it("is licence-gated with the page's own (empty) permission set", () => {
    expect(fsmScheduleExport).toMatchObject({ id: "fsm.schedule", module: "fsm", permissions: [] });
  });

  it("takes only the page's own date and view, validated as the page does", () => {
    const parse = (q: string) => fsmScheduleExport.parseFilters!(new URLSearchParams(q));
    expect(parse("")).toEqual({ date: "", view: "day" });
    expect(parse("date=2026-09-24&view=week&businessId=biz-b")).toEqual({ date: "2026-09-24", view: "week" });
    expect(parse("date=24/09/2026&view=month")).toEqual({ date: "", view: "day" });
  });

  it("covers exactly the page's days: one day, or its Monday-to-Sunday week", () => {
    expect(scheduleRange({ date: "2026-09-24", view: "day" })).toEqual({
      days: ["2026-09-24"],
      start: new Date("2026-09-24T00:00:00").toISOString(),
      end: new Date("2026-09-25T00:00:00").toISOString(),
    });
    const week = scheduleRange({ date: "2026-09-24", view: "week" });
    expect(week.days).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(week.start).toBe(new Date("2026-09-21T00:00:00").toISOString());
    expect(week.end).toBe(new Date("2026-09-28T00:00:00").toISOString());
    // No date: today, as the page defaults.
    expect(scheduleRange({ date: "", view: "day" }, new Date("2026-09-26T06:00:00Z")).days).toEqual(["2026-09-26"]);
    expect(fsmScheduleExport.describeFilters!({ date: "2026-09-24", view: "week" })).toEqual({ View: "Week", Dates: "2026-09-21 to 2026-09-27" });
  });

  it("reads the selected range for the resolved business only", async () => {
    const filters = fsmScheduleExport.parseFilters!(new URLSearchParams("date=2026-09-24&view=week&businessId=biz-b"));
    const workbook = await fsmScheduleExport.load(context, filters);
    expect(listEventsForRange).toHaveBeenCalledWith("biz-a", new Date("2026-09-21T00:00:00").toISOString(), new Date("2026-09-28T00:00:00").toISOString());
    expect(workbook.metadata).toEqual({ Period: "2026-09-21 to 2026-09-27", View: "Week" });
  });

  it("writes every event with labels, technicians and location; blanks stay blank", async () => {
    const [header, first, second] = await csv(await fsmScheduleExport.load(context, { date: "2026-09-24", view: "day" }));
    expect(header).toBe("Event,Job / opportunity #,Linked to,Customer,Technician,Start,End,All day,Status,Arrival window start,Arrival window end,Location,Notes");
    expect(first).toBe(
      "Work,JOB-1,Job,Asha Traders,Ravi; Meena,2026-09-24T10:00:00+05:30,2026-09-24T12:00:00+05:30,No,On the way,2026-09-24T09:30:00+05:30,,\"Site 4, Pune\",",
    );
    expect(second).toBe("Estimate visit,OPP-1,Opportunity,Asha Traders,,2026-09-24T10:00:00+05:30,,No,Scheduled,,,,");
    expect([first, second].join("\n")).not.toMatch(/emp-1|job-1|user-9/);
  });

  it("produces a valid header-only file for an empty day", async () => {
    state.events = [];
    state.details = new Map();
    expect(await csv(await fsmScheduleExport.load(context, { date: "2026-09-24", view: "day" }))).toHaveLength(1);
  });
});
