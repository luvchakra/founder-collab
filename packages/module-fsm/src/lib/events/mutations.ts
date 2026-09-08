import { createClient } from "../../db/server";
import type { CreateEventInput, RescheduleEventInput } from "./types";

/** `unscheduled -> scheduled` for real, now that events actually exist -- jobs/
 * mutations.ts#markJobScheduled documented this exact gap when F-5 landed ("F-6 will
 * additionally drive this transition for real once it starts creating events"). A
 * plain filtered update rather than importing that function's own throw-on-no-match
 * `transition()` helper: this is a best-effort side effect of creating a work event, not
 * a user-initiated action that should surface an error if the job had already moved on
 * (e.g. scheduling a second work event against an already-`in_progress` job is normal,
 * not a failure). */
async function tryAdvanceJobToScheduled(businessId: string, jobId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("jobs").update({ status: "scheduled" }).eq("id", jobId).eq("business_id", businessId).eq("status", "unscheduled");
  if (error) throw error;
}

/** `new -> estimate_scheduled` (PRD §4: "schedule an estimate event ... moves to Estimate
 * Scheduled") -- same best-effort-filtered-update reasoning as
 * `tryAdvanceJobToScheduled` above; scheduling a second estimate visit against an
 * opportunity that's already past `new` is normal, not an error. */
async function tryAdvanceOpportunityToEstimateScheduled(businessId: string, opportunityId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ status: "estimate_scheduled" })
    .eq("id", opportunityId)
    .eq("business_id", businessId)
    .eq("status", "new");
  if (error) throw error;
}

export async function createEvent(businessId: string, input: CreateEventInput): Promise<string> {
  if (!input.jobId && !input.opportunityId) {
    throw new Error("An event must be attached to a job or an opportunity.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .insert({
      business_id: businessId,
      kind: input.kind,
      job_id: input.jobId || null,
      opportunity_id: input.opportunityId || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt || null,
      all_day: input.allDay ?? false,
      description: input.description?.trim() || null,
      arrival_window_start: input.arrivalWindowStart || null,
      arrival_window_end: input.arrivalWindowEnd || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.assigneeEmployeeIds?.length) {
    const { error: assigneesError } = await supabase
      .from("event_assignees")
      .insert(input.assigneeEmployeeIds.map((employeeId) => ({ business_id: businessId, event_id: data.id, employee_id: employeeId })));
    if (assigneesError) throw assigneesError;
  }

  if (input.kind === "work" && input.jobId) await tryAdvanceJobToScheduled(businessId, input.jobId);
  if (input.kind === "estimate" && input.opportunityId) await tryAdvanceOpportunityToEstimateScheduled(businessId, input.opportunityId);

  return data.id;
}

/** "Drag to reschedule" (PRD §2 Scheduling row, MUST) lands here regardless of whether
 * the drag changed the day, the time, or both -- the calendar UI always knows the
 * event's full new `starts_at` (and `ends_at`, shifted by the same delta) before calling
 * this, so there's one code path for both "moved to a different day" and "moved to a
 * different hour". */
export async function rescheduleEvent(id: string, businessId: string, patch: RescheduleEventInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ starts_at: patch.startsAt, ends_at: patch.endsAt ?? null })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
}

export async function updateEventDescription(id: string, businessId: string, description: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ description: description.trim() || null }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

/** Replaces an event's assignee set wholesale -- covers both "drag a card into a
 * different technician's row/column" (reassign) and the create/edit dialog's own
 * multi-select. Two round trips (delete-then-insert), not a single upsert, matching how
 * `estimates/mutations.ts` already replaces charge-line sets on a full save -- there's
 * no partial-update case here that would need finer granularity. */
export async function setEventAssignees(id: string, businessId: string, employeeIds: string[]): Promise<void> {
  const supabase = await createClient();
  const { error: deleteError } = await supabase.from("event_assignees").delete().eq("event_id", id).eq("business_id", businessId);
  if (deleteError) throw deleteError;

  if (employeeIds.length === 0) return;
  const { error: insertError } = await supabase
    .from("event_assignees")
    .insert(employeeIds.map((employeeId) => ({ business_id: businessId, event_id: id, employee_id: employeeId })));
  if (insertError) throw insertError;
}

/** Beyond `scheduled`/`cancelled`, `fsm.events.status`'s remaining values
 * (`en_route`/`arrived`/`done`) belong to F-7's own field-execution "on my way"/clock-in
 * flow on `/fsm/my-day` -- not exposed here. */
export async function cancelEvent(id: string, businessId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").update({ status: "cancelled" }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

export async function deleteEvent(id: string, businessId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}
