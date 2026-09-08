"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createEvent, rescheduleEvent, setEventAssignees, cancelEvent, deleteEvent } from "@cofounderai/module-fsm/lib/events/mutations";
import { setTechnicianStatus } from "@cofounderai/module-fsm/lib/employees/mutations";
import type { EventKind } from "@cofounderai/module-fsm/lib/events/types";
import type { CreateEventActionState } from "@cofounderai/module-fsm/components/schedule/create-event-dialog";

function schedulePath(businessId: string) {
  return `/dashboard/businesses/${businessId}/fsm/schedule`;
}

function toIso(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  if (!str) return null;
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function createEventAction(businessId: string, _prevState: CreateEventActionState, formData: FormData): Promise<CreateEventActionState> {
  try {
    await requirePermission(businessId, "schedule.manage");

    const kind = String(formData.get("kind") ?? "work") as EventKind;
    const jobId = String(formData.get("job_id") ?? "").trim() || undefined;
    const opportunityId = String(formData.get("opportunity_id") ?? "").trim() || undefined;
    const startsAt = toIso(formData.get("starts_at"));
    if (!startsAt) throw new Error("A start date/time is required.");

    const id = await createEvent(businessId, {
      kind,
      jobId,
      opportunityId,
      startsAt,
      endsAt: toIso(formData.get("ends_at")),
      allDay: formData.get("all_day") === "on",
      description: String(formData.get("description") ?? ""),
      arrivalWindowStart: toIso(formData.get("arrival_window_start")),
      arrivalWindowEnd: toIso(formData.get("arrival_window_end")),
      assigneeEmployeeIds: formData.getAll("employee_ids").map(String),
    });

    revalidatePath(schedulePath(businessId));
    return { success: true, id };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create event." };
  }
}

export async function rescheduleEventAction(businessId: string, eventId: string, startsAt: string, endsAt: string | null): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await rescheduleEvent(eventId, businessId, { startsAt, endsAt });
  revalidatePath(schedulePath(businessId));
}

export async function reassignEventAction(businessId: string, eventId: string, employeeIds: string[]): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await setEventAssignees(eventId, businessId, employeeIds);
  revalidatePath(schedulePath(businessId));
}

export async function cancelEventAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await cancelEvent(eventId, businessId);
  revalidatePath(schedulePath(businessId));
}

export async function deleteEventAction(businessId: string, eventId: string): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await deleteEvent(eventId, businessId);
  revalidatePath(schedulePath(businessId));
}

export async function setTechnicianStatusAction(businessId: string, userId: string, isTechnician: boolean): Promise<void> {
  await requirePermission(businessId, "schedule.manage");
  await setTechnicianStatus(businessId, userId, isTechnician);
  revalidatePath(schedulePath(businessId));
}
