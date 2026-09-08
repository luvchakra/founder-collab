import { createClient } from "../../db/server";

/** S-5's own registry-driven dashboard: an open+pending ticket count across every
 * business the caller already knows has `crm` licensed -- see
 * `module-fsm/lib/dashboard/queries.ts#getOpenJobsCount`'s own docstring for the
 * "trusts the caller's license filtering" reasoning. */
export async function getOpenTicketsCount(businessIds: string[]): Promise<number> {
  if (businessIds.length === 0) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .in("business_id", businessIds)
    .in("status", ["open", "pending"]);
  if (error) throw error;
  return count ?? 0;
}
