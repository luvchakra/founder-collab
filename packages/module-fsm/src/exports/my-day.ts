// EXP-FSM-07 -- My Day export: the signed-in technician's own day, and nothing else.
//
// The technician is resolved exactly as the My Day page resolves it -- getCurrentEmployee(),
// the session user's own active core.employees row -- and every read below is narrowed
// to that one employee id. No request parameter can name another technician: the page
// has no filters, and this adapter reads none.
//
// "Arrival" is the event's arrival window (FSM records that an event was arrived at as
// its status, not when); "completion" is the job's own completion time.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { ExportDeniedError } from "@cofounderai/core/exports/server";
import { getCurrentEmployee } from "../lib/employees/queries";
import { listMyEventsForRange } from "../lib/events/queries";
import type { ScheduleEventItem } from "../lib/events/types";
import { EVENT_KIND_LABEL, EVENT_STATUS_LABEL, labelFor } from "./labels";
import { describeEventsForExport, listOwnTimeEntriesForExport, type EventDetails, type OwnTimeEntryRow } from "./queries";

/** The My Day page's own "today" window (service/my-day/page.tsx). */
export function myDayRange(now = new Date()): { day: string; start: string; end: string } {
  const day = now.toISOString().slice(0, 10);
  const startDate = new Date(`${day}T00:00:00`);
  return { day, start: startDate.toISOString(), end: new Date(startDate.getTime() + 24 * 60 * 60 * 1000).toISOString() };
}

type DayRow = ScheduleEventItem & { details: EventDetails | undefined; entries: OwnTimeEntryRow[] };

function minutesOf(entry: OwnTimeEntryRow): number | null {
  return entry.duration_minutes == null ? null : Number(entry.duration_minutes);
}

export const fsmMyDayExport: ExportAdapter<Record<string, never>> = {
  id: "fsm.my-day",
  module: "fsm",
  // My Day takes the fsm licence and business membership (RLS) only -- `schedule.manage`
  // and `time_entries.edit` gate its buttons. Being a technician is checked in `load`.
  permissions: [],
  // Nothing from the request is read: whose day this is comes from the session alone.
  parseFilters: () => ({}),
  async load(context) {
    const employee = await getCurrentEmployee(context.businessId);
    if (!employee || employee.user_id !== context.userId) {
      throw new ExportDeniedError("You aren't set up as a technician for this business.", 403);
    }

    const range = myDayRange();
    const [events, entries] = await Promise.all([
      listMyEventsForRange(context.businessId, employee.id, range.start, range.end),
      listOwnTimeEntriesForExport(context.businessId, employee.id, range.start, range.end),
    ]);
    const details = await describeEventsForExport(events);

    const rows: DayRow[] = events.map((e) => ({
      ...e,
      details: details.get(e.id),
      entries: e.job_id ? entries.filter((t) => t.job_id === e.job_id) : [],
    }));
    const technician = employee.full_name || employee.email || "Technician";

    return {
      module: "fsm",
      resource: "my-day",
      title: "My Day",
      metadata: { Day: range.day, Technician: technician },
      sheets: [
        {
          sheetName: "My Day",
          columns: [
            { key: "subject", header: "Job / opportunity #", getValue: (r: DayRow) => r.subject_label },
            { key: "event", header: "Event", getValue: (r: DayRow) => labelFor(EVENT_KIND_LABEL, r.kind) },
            { key: "customer", header: "Customer", getValue: (r: DayRow) => r.party_name },
            { key: "location", header: "Location", getValue: (r: DayRow) => r.details?.location },
            { key: "start", header: "Scheduled start", type: "datetime", getValue: (r: DayRow) => r.starts_at },
            { key: "end", header: "Scheduled end", type: "datetime", getValue: (r: DayRow) => r.ends_at },
            { key: "arrival_from", header: "Arrival window start", type: "datetime", getValue: (r: DayRow) => r.arrival_window_start },
            { key: "arrival_to", header: "Arrival window end", type: "datetime", getValue: (r: DayRow) => r.arrival_window_end },
            { key: "status", header: "Status", getValue: (r: DayRow) => labelFor(EVENT_STATUS_LABEL, r.status) },
            { key: "completed", header: "Job completed", type: "datetime", getValue: (r: DayRow) => r.details?.job_completed_at },
            { key: "clock_in", header: "Clocked in", type: "datetime", getValue: (r: DayRow) => r.entries[0]?.started_at },
            { key: "clock_out", header: "Clocked out", type: "datetime", getValue: (r: DayRow) => r.entries[r.entries.length - 1]?.ended_at },
            {
              key: "minutes",
              header: "Time logged (min)",
              type: "number",
              // Blank while nothing is logged (or still clocked in), never a made-up 0.
              getValue: (r: DayRow) => {
                const logged = r.entries.map(minutesOf).filter((m): m is number => m !== null);
                return logged.length ? Math.round(logged.reduce((sum, m) => sum + m, 0) * 100) / 100 : null;
              },
            },
          ],
          rows,
        },
        {
          sheetName: "Time entries",
          columns: [
            { key: "subject", header: "Job #", getValue: (t: OwnTimeEntryRow) => t.job_number },
            { key: "customer", header: "Customer", getValue: (t: OwnTimeEntryRow) => t.customer },
            { key: "clock_in", header: "Clocked in", type: "datetime", getValue: (t: OwnTimeEntryRow) => t.started_at },
            { key: "clock_out", header: "Clocked out", type: "datetime", getValue: (t: OwnTimeEntryRow) => t.ended_at },
            { key: "minutes", header: "Minutes", type: "number", getValue: (t: OwnTimeEntryRow) => minutesOf(t) },
            { key: "billable", header: "Billable", type: "boolean", getValue: (t: OwnTimeEntryRow) => t.is_billable },
            { key: "notes", header: "Notes", getValue: (t: OwnTimeEntryRow) => t.notes },
          ],
          rows: entries,
        },
      ],
    };
  },
};
