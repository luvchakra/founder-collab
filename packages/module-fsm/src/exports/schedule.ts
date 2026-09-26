// EXP-FSM-06 -- Service schedule export: exactly the day or week the Schedule page is
// showing (its own `date` + `view` search params), every event on it.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listEventsForRange } from "../lib/events/queries";
import type { ScheduleEventItem } from "../lib/events/types";
import { EVENT_KIND_LABEL, EVENT_STATUS_LABEL, labelFor } from "./labels";
import { describeEventsForExport, type EventDetails } from "./queries";

type Filters = { date: string; view: "day" | "week" };

// The schedule page's own date helpers (service/schedule/page.tsx), repeated so the
// export covers exactly the days the page shows.
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDate(d);
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return isoDate(d);
}

/** The page's `[rangeStart, rangeEnd)` for an anchor date and view. */
export function scheduleRange(filters: Filters, now = new Date()): { days: string[]; start: string; end: string } {
  const anchor = filters.date || isoDate(now);
  const days = filters.view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)) : [anchor];
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return {
    days,
    start: new Date(`${first}T00:00:00`).toISOString(),
    end: new Date(`${addDays(last, 1)}T00:00:00`).toISOString(),
  };
}

type Row = ScheduleEventItem & { details: EventDetails | undefined };

export const fsmScheduleExport: ExportAdapter<Filters> = {
  id: "fsm.schedule",
  module: "fsm",
  // Viewing the schedule takes the fsm licence and business membership (RLS) only --
  // `schedule.manage` / `schedule.print_work_orders` gate its edit and print actions.
  permissions: [],
  parseFilters: (params) => {
    const date = params.get("date") ?? "";
    return {
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      view: params.get("view") === "week" ? "week" : "day",
    };
  },
  describeFilters: (f) => {
    const { days } = scheduleRange(f);
    return {
      View: f.view === "week" ? "Week" : "Day",
      Dates: days.length > 1 ? `${days[0]} to ${days[days.length - 1]}` : days[0] ?? "",
    };
  },
  async load(context, filters) {
    const range = scheduleRange(filters);
    const events = await listEventsForRange(context.businessId, range.start, range.end);
    const details = await describeEventsForExport(events);
    const rows: Row[] = events.map((e) => ({ ...e, details: details.get(e.id) }));
    const period = range.days.length > 1 ? `${range.days[0]} to ${range.days[range.days.length - 1]}` : range.days[0] ?? "";

    return {
      module: "fsm",
      resource: "schedule",
      title: "Service schedule",
      metadata: { Period: period, View: filters.view === "week" ? "Week" : "Day" },
      sheets: [
        {
          sheetName: "Schedule",
          columns: [
            { key: "event", header: "Event", getValue: (r: Row) => labelFor(EVENT_KIND_LABEL, r.kind) },
            { key: "subject", header: "Job / opportunity #", getValue: (r: Row) => r.subject_label },
            { key: "linked", header: "Linked to", getValue: (r: Row) => (r.job_id ? "Job" : r.opportunity_id ? "Opportunity" : null) },
            { key: "customer", header: "Customer", getValue: (r: Row) => r.party_name },
            { key: "technician", header: "Technician", getValue: (r: Row) => r.details?.technician_names ?? [] },
            { key: "start", header: "Start", type: "datetime", getValue: (r: Row) => r.starts_at },
            { key: "end", header: "End", type: "datetime", getValue: (r: Row) => r.ends_at },
            { key: "all_day", header: "All day", type: "boolean", getValue: (r: Row) => r.all_day },
            { key: "status", header: "Status", getValue: (r: Row) => labelFor(EVENT_STATUS_LABEL, r.status) },
            { key: "arrival_from", header: "Arrival window start", type: "datetime", getValue: (r: Row) => r.arrival_window_start },
            { key: "arrival_to", header: "Arrival window end", type: "datetime", getValue: (r: Row) => r.arrival_window_end },
            { key: "location", header: "Location", getValue: (r: Row) => r.details?.location },
            { key: "notes", header: "Notes", getValue: (r: Row) => r.description },
          ],
          rows,
        },
      ],
    };
  },
};
