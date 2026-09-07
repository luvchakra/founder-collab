import { createAdminClient } from "../db/admin";

export type AdminUserOption = { id: string; email: string | null; full_name: string | null };
export type AdminBusinessOption = { id: string; name: string; role: string };

/** Every user on the platform, for the admin seed tool's "pick a user" step -- reads
 * core.user_profiles (populated by the signup trigger) via the service-role client
 * rather than paginating supabase.auth.admin.listUsers(), since the profile row already
 * carries the display fields this needs. */
export async function listAllUsers(): Promise<AdminUserOption[]> {
  const supabase = createAdminClient({ schema: "core" });
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, email, full_name")
    .order("email");
  if (error) throw error;
  return data;
}

/** Every business a given user belongs to, with their role -- for the admin seed tool's
 * "pick a business" step. Uses the service-role client since the admin isn't necessarily
 * a member of the target user's businesses themselves (RLS would otherwise scope this to
 * the *caller's* own businesses, not the selected user's). */
export async function listBusinessesForUser(userId: string): Promise<AdminBusinessOption[]> {
  const supabase = createAdminClient({ schema: "core" });
  const { data: members, error } = await supabase
    .from("business_members")
    .select("business_id, role")
    .eq("user_id", userId);
  if (error) throw error;
  if (members.length === 0) return [];

  const businessIds = members.map((m) => m.business_id);
  const { data: businesses, error: businessesError } = await supabase
    .from("businesses")
    .select("id, name")
    .in("id", businessIds);
  if (businessesError) throw businessesError;

  const roleByBusinessId = new Map(members.map((m) => [m.business_id, m.role]));
  return businesses.map((b) => ({ id: b.id, name: b.name, role: roleByBusinessId.get(b.id) ?? "" }));
}
