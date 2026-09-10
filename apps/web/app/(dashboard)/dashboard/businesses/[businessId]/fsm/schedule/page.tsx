import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { listEventsForRange, listJobOptionsForScheduling, listOpportunityOptionsForScheduling } from "@cofounderai/module-fsm/lib/events/queries";
import { listEmployees, listTechnicianRoster } from "@cofounderai/module-fsm/lib/employees/queries";
import { listLowStockAlerts } from "@cofounderai/module-inventory/contract/index";
import { ScheduleCalendar } from "@cofounderai/module-fsm/components/schedule/schedule-calendar";
import {
  cancelEventAction,
  createEventAction,
  deleteEventAction,
  reassignEventAction,
  rescheduleEventAction,
  setTechnicianStatusAction,
  updateEventDescriptionAction,
} from "./actions";

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

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { businessId } = await params;
  const { date, view: viewParam } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const view: "day" | "week" = viewParam === "week" ? "week" : "day";
  const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : isoDate(new Date());
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(mondayOf(anchor), i)) : [anchor];
  const rangeStart = new Date(`${days[0]}T00:00:00`).toISOString();
  const rangeEnd = new Date(`${addDays(days[days.length - 1], 1)}T00:00:00`).toISOString();

  const [events, employees, technicianRoster, jobs, opportunities, canManage, canPrint] = await Promise.all([
    listEventsForRange(businessId, rangeStart, rangeEnd),
    listEmployees(businessId),
    listTechnicianRoster(businessId),
    listJobOptionsForScheduling(businessId),
    listOpportunityOptionsForScheduling(businessId),
    hasPermission(businessId, "schedule.manage"),
    hasPermission(businessId, "schedule.print_work_orders"),
  ]);

  // F-14: "stock.low surfaced to the dispatcher" -- the schedule page is this platform's
  // own dispatcher surface (no dedicated /fsm dashboard route exists yet). Degrades to
  // nothing when inventory isn't licensed (ADR-10's own normal-result contract, not an
  // exception) rather than showing an error.
  const lowStockResult = await listLowStockAlerts(businessId);
  const lowStockAlerts = lowStockResult.ok ? lowStockResult.data : [];

  const stepBy = view === "week" ? 7 : 1;
  const href = (d: string, v: "day" | "week") => `/dashboard/businesses/${businessId}/fsm/schedule?date=${d}&view=${v}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">Work, estimate, and reminder events for {business.name}, by technician.</p>
      </div>

      {lowStockAlerts.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Low stock ({lowStockAlerts.length})</p>
          <ul className="mt-1 list-disc pl-5">
            {lowStockAlerts.slice(0, 5).map((a) => (
              <li key={a.id}>{a.title}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ScheduleCalendar
        businessId={businessId}
        businessName={business.name}
        view={view}
        days={days}
        events={events}
        employees={employees}
        jobs={jobs}
        opportunities={opportunities}
        technicianRoster={technicianRoster}
        canManage={canManage}
        canPrint={canPrint}
        prevHref={href(addDays(anchor, -stepBy), view)}
        nextHref={href(addDays(anchor, stepBy), view)}
        todayHref={href(isoDate(new Date()), view)}
        dayViewHref={href(anchor, "day")}
        weekViewHref={href(anchor, "week")}
        createEventAction={createEventAction.bind(null, businessId)}
        rescheduleAction={rescheduleEventAction.bind(null, businessId)}
        reassignAction={reassignEventAction.bind(null, businessId)}
        updateDescriptionAction={updateEventDescriptionAction.bind(null, businessId)}
        cancelAction={cancelEventAction.bind(null, businessId)}
        deleteAction={deleteEventAction.bind(null, businessId)}
        setTechnicianStatusAction={setTechnicianStatusAction.bind(null, businessId)}
      />
    </div>
  );
}
