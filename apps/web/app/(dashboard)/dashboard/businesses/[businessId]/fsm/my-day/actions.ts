"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { notifyOnTheWay, markEventArrived, markEventDone } from "@cofounderai/module-fsm/lib/events/mutations";
import { clockIn, clockOut } from "@cofounderai/module-fsm/lib/time-entries/mutations";

function myDayPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/fsm/my-day`;
}

export async function notifyOnTheWayAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await notifyOnTheWay(businessId, eventId);
  revalidatePath(myDayPath(businessId));
}

export async function markEventArrivedAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await markEventArrived(eventId, businessId);
  revalidatePath(myDayPath(businessId));
}

export async function markEventDoneAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await markEventDone(eventId, businessId);
  revalidatePath(myDayPath(businessId));
}

export async function clockInAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "time_entries.edit");
  await clockIn(businessId, jobId);
  revalidatePath(myDayPath(businessId));
}

export async function clockOutAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "time_entries.edit");
  await clockOut(businessId, jobId);
  revalidatePath(myDayPath(businessId));
}
