import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { EmployeeOption, TechnicianRosterRow } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Active technicians a schedule event can be assigned to. `core.employees` (the
 * entity-ownership map's canonical "technician" home) has no name column of its own --
 * joined against `core.user_profiles` for display, same join shape module-inventory's
 * own `listBusinessMembers()` already uses for business_members. */
export const listEmployees = cache(async (businessId: string): Promise<EmployeeOption[]> => {
  const core = await coreClient();
  const { data: rows, error } = await core
    .from("employees")
    .select("id, user_id, job_title")
    .eq("business_id", businessId)
    .eq("is_active", true);
  if (error) throw error;
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id).filter((id): id is string => Boolean(id));
  const { data: profiles, error: profilesError } = userIds.length
    ? await core.from("user_profiles").select("id, full_name, email").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id ?? "",
    job_title: r.job_title,
    full_name: r.user_id ? profileById.get(r.user_id)?.full_name ?? null : null,
    email: r.user_id ? profileById.get(r.user_id)?.email ?? null : null,
  }));
});

/** The caller's own `core.employees` row for this business, if they have one -- backs
 * `/fsm/my-day` (whose schedule this is) and clock-in/out (whose time entry this is).
 * `null` for a business member who isn't a technician (e.g. an owner who only dispatches
 * and never clocks in) -- callers treat that as "nothing to show/do here", not an error. */
export const getCurrentEmployee = cache(async (businessId: string): Promise<EmployeeOption | null> => {
  const core = await coreClient();
  const {
    data: { user },
  } = await core.auth.getUser();
  if (!user) return null;

  const { data: row, error } = await core
    .from("employees")
    .select("id, user_id, job_title")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: profile, error: profileError } = await core.from("user_profiles").select("full_name, email").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;

  return { id: row.id, user_id: row.user_id ?? "", job_title: row.job_title, full_name: profile?.full_name ?? null, email: profile?.email ?? null };
});

/** Every business member alongside whether they're already a technician (has an active
 * `core.employees` row) -- backs the roster toggle on the schedule page. No employee
 * CRUD/"Manage Users" screen exists anywhere in the platform yet (a genuine gap upstream
 * of this story, not FSM's to fully solve) -- this is the minimal roster this story
 * needs to make "assign to a technician" usable at all. */
export const listTechnicianRoster = cache(async (businessId: string): Promise<TechnicianRosterRow[]> => {
  const core = await coreClient();
  const [membersRes, employeesRes] = await Promise.all([
    core.from("business_members").select("user_id, role").eq("business_id", businessId),
    core.from("employees").select("id, user_id, is_active").eq("business_id", businessId),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (employeesRes.error) throw employeesRes.error;
  if (membersRes.data.length === 0) return [];

  const userIds = membersRes.data.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await core.from("user_profiles").select("id, full_name, email").in("id", userIds);
  if (profilesError) throw profilesError;
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const employeeByUserId = new Map(employeesRes.data.filter((e) => e.user_id).map((e) => [e.user_id as string, e]));

  return membersRes.data.map((m) => {
    const employee = employeeByUserId.get(m.user_id);
    return {
      user_id: m.user_id,
      role: m.role,
      full_name: profileById.get(m.user_id)?.full_name ?? null,
      email: profileById.get(m.user_id)?.email ?? null,
      employee_id: employee?.id ?? null,
      is_active: Boolean(employee?.is_active),
    };
  });
});
