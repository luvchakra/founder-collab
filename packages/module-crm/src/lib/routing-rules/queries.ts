import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import type { EmployeeOption, RoutingRule } from "./types";

export const listRoutingRules = cache(async (businessId: string): Promise<RoutingRule[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("routing_rules")
    .select("*")
    .eq("business_id", businessId)
    .order("priority");
  if (error) throw error;
  return data;
});

/** Mirrors `lib/tickets/queries.ts#listEmployeeOptions` -- see that file's own
 * docstring for why it's duplicated per module boundary rules. */
export const listEmployeeOptions = cache(async (businessId: string): Promise<EmployeeOption[]> => {
  const core = await createCoreClient({ schema: "core" });
  const { data: rows, error } = await core
    .from("employees")
    .select("id, user_id")
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
    full_name: r.user_id ? profileById.get(r.user_id)?.full_name ?? null : null,
    email: r.user_id ? profileById.get(r.user_id)?.email ?? null : null,
  }));
});
