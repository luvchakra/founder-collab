import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";

/** Resolves the signed-in user's own `core.employees` row for this business -- needed
 * by "assigned to me" filters (CRM-06.2) and anywhere else that needs to compare an
 * owner column against the viewer rather than a picked employee. Null when the viewer
 * has no employee record for this business (e.g. an account owner who was never added
 * as an employee row) -- a legitimate state, not an error. Uses the crm-scoped client
 * only to read the signed-in user (`auth.getUser()` is schema-independent); the actual
 * `employees` lookup goes through the core-scoped client since that table lives in
 * `core`, not `crm`. */
export async function getCurrentEmployeeId(businessId: string): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core.from("employees").select("id").eq("business_id", businessId).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
