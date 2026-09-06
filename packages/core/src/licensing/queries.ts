import { createClient } from "../db/server";
import type { License } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Every license row for one business -- RLS-scoped (core.licenses' own "members can
 * view their business licenses" policy, C-3), never the admin client: this is a read for
 * the signed-in user's own settings page, not a privileged operation. */
export async function listLicensesForBusiness(businessId: string): Promise<License[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("licenses").select("*").eq("business_id", businessId);
  if (error) throw error;
  return data;
}
