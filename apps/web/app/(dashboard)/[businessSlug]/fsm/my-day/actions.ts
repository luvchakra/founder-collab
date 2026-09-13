"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { notifyOnTheWay, markEventArrived, markEventDone } from "@cofounderai/module-fsm/lib/events/mutations";
import { clockIn, clockOut } from "@cofounderai/module-fsm/lib/time-entries/mutations";

async function myDayPath(businessId: string) {
  return `${await businessPath(businessId)}/fsm/my-day`;
}

export async function notifyOnTheWayAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await notifyOnTheWay(businessId, eventId);
  revalidatePath(await myDayPath(businessId));
}

export async function markEventArrivedAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await markEventArrived(eventId, businessId);
  revalidatePath(await myDayPath(businessId));
}

export async function markEventDoneAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await markEventDone(eventId, businessId);
  revalidatePath(await myDayPath(businessId));
}

export async function clockInAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "time_entries.edit");
  await clockIn(businessId, jobId);
  revalidatePath(await myDayPath(businessId));
}

export async function clockOutAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "time_entries.edit");
  await clockOut(businessId, jobId);
  revalidatePath(await myDayPath(businessId));
}
