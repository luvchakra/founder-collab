import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { getCurrentEmployee } from "@cofounderai/module-fsm/lib/employees/queries";
import { listMyEventsForRange } from "@cofounderai/module-fsm/lib/events/queries";
import { getOpenTimeEntry } from "@cofounderai/module-fsm/lib/time-entries/queries";
import { MyDayList } from "@cofounderai/module-fsm/components/field/my-day-list";
import { clockInAction, clockOutAction, markEventArrivedAction, markEventDoneAction, notifyOnTheWayAction } from "./actions";

export default async function MyDayPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const employee = await getCurrentEmployee(businessId);
  if (!employee) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">My Day</h1>
        <p className="text-sm text-muted-foreground">
          You aren&apos;t set up as a technician for {business.name} yet -- an owner or admin can add you from the Schedule page.
        </p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const rangeStart = new Date(`${today}T00:00:00`).toISOString();
  const rangeEnd = new Date(new Date(`${today}T00:00:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const [events, openTimeEntry, canManageEvents, canClockInOut] = await Promise.all([
    listMyEventsForRange(businessId, employee.id, rangeStart, rangeEnd),
    getOpenTimeEntry(businessId),
    hasPermission(businessId, "schedule.manage"),
    hasPermission(businessId, "time_entries.edit"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">My Day</h1>
        <p className="mt-1 text-sm text-muted-foreground">Today&apos;s schedule for {business.name}.</p>
      </div>

      <MyDayList
        events={events}
        openTimeEntry={openTimeEntry}
        canManageEvents={canManageEvents}
        canClockInOut={canClockInOut}
        jobHref={(jobId) => `/dashboard/businesses/${businessId}/fsm/jobs/${jobId}`}
        opportunityHref={(opportunityId) => `/dashboard/businesses/${businessId}/fsm/opportunities/${opportunityId}`}
        notifyOnTheWayAction={notifyOnTheWayAction.bind(null, businessId)}
        markArrivedAction={markEventArrivedAction.bind(null, businessId)}
        markDoneAction={markEventDoneAction.bind(null, businessId)}
        clockInAction={clockInAction.bind(null, businessId)}
        clockOutAction={clockOutAction.bind(null, businessId)}
      />
    </div>
  );
}
