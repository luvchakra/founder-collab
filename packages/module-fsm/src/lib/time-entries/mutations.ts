import { createClient } from "../../db/server";
import { getCurrentEmployee } from "../employees/queries";

/** "Clock In to track time (keeps running when the app is closed)" (PRD §1.8) --
 * `fsm.time_entries.job_id` is `not null` (F-1's own DDL), so clocking in is always
 * against a specific job, matching how `/fsm/my-day` presents it (one button per
 * today's job, not a job-less global toggle). The DB's own
 * `time_entries_one_open_per_employee` unique index is the actual enforcement; the
 * 23505 catch here only turns that into a clear message instead of a raw constraint
 * error surfacing to the UI. */
export async function clockIn(businessId: string, jobId: string): Promise<void> {
  const employee = await getCurrentEmployee(businessId);
  if (!employee) throw new Error("You're not set up as a technician for this business.");

  const supabase = await createClient();
  const { error } = await supabase.from("time_entries").insert({ business_id: businessId, job_id: jobId, employee_id: employee.id });
  if (error) {
    if (error.code === "23505") throw new Error("You're already clocked into another job -- clock out of it first.");
    throw error;
  }
}

/** Scoped to `jobId` (not just "whichever entry is open") so clicking "Clock out" on the
 * wrong job's card -- while genuinely clocked into a different one -- fails loudly
 * instead of silently closing the wrong entry. */
export async function clockOut(businessId: string, jobId: string): Promise<void> {
  const employee = await getCurrentEmployee(businessId);
  if (!employee) throw new Error("You're not set up as a technician for this business.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("employee_id", employee.id)
    .eq("job_id", jobId)
    .is("ended_at", null)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("You're not currently clocked into this job.");
}
