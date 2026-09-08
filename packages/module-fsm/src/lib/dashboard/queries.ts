import { createClient } from "../../db/server";

/** S-5's own registry-driven dashboard: an open-job count across every business the
 * caller already knows has `fsm` licensed (the platform dashboard's own job -- this
 * function trusts the caller's license filtering, same as
 * `module-discovery/lib/usage/queries.ts#getWorkspaceUsageForWorkspaces` trusts its own
 * caller's pre-resolved workspace id list). "Open" = not completed/cancelled. */
export async function getOpenJobsCount(businessIds: string[]): Promise<number> {
  if (businessIds.length === 0) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .in("business_id", businessIds)
    .not("status", "in", "(completed,cancelled)");
  if (error) throw error;
  return count ?? 0;
}
