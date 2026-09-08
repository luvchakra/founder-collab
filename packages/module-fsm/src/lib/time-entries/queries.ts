import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getCurrentEmployee } from "../employees/queries";
import type { OpenTimeEntry, TimeEntryItem } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Whichever job the caller is clocked into right now, anywhere in this business --
 * `fsm.time_entries`' own unique index guarantees at most one such row per employee, so
 * this is a plain lookup, not a "pick the latest" query. `null` if the caller isn't a
 * technician at all (`getCurrentEmployee` returned nothing) or just isn't clocked in. */
export const getOpenTimeEntry = cache(async (businessId: string): Promise<OpenTimeEntry | null> => {
  const employee = await getCurrentEmployee(businessId);
  if (!employee) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, job_id, started_at")
    .eq("business_id", businessId)
    .eq("employee_id", employee.id)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export const listTimeEntriesForJob = cache(async (businessId: string, jobId: string): Promise<TimeEntryItem[]> => {
  const supabase = await createClient();
  const { data: entries, error } = await supabase
    .from("time_entries")
    .select("*")
    .eq("business_id", businessId)
    .eq("job_id", jobId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  if (entries.length === 0) return [];

  const core = await coreClient();
  const employeeIds = [...new Set(entries.map((e) => e.employee_id))];
  const { data: employees, error: employeesError } = await core.from("employees").select("id, user_id").in("id", employeeIds);
  if (employeesError) throw employeesError;

  const userIds = employees.map((e) => e.user_id).filter((id): id is string => Boolean(id));
  const { data: profiles, error: profilesError } = userIds.length
    ? await core.from("user_profiles").select("id, full_name, email").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileByUserId = new Map(profiles.map((p) => [p.id, p]));
  const userIdByEmployeeId = new Map(employees.map((e) => [e.id, e.user_id]));

  return entries.map((e) => {
    const userId = userIdByEmployeeId.get(e.employee_id);
    const profile = userId ? profileByUserId.get(userId) : undefined;
    return { ...e, employee_name: profile?.full_name || profile?.email || "Unknown" };
  });
});
