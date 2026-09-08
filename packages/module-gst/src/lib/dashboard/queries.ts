import { createClient } from "../../db/server";

/** S-5's own registry-driven dashboard: this calendar month's generated e-invoice count
 * across every business the caller already knows has `gst` licensed -- see
 * `module-fsm/lib/dashboard/queries.ts#getOpenJobsCount`'s own docstring for the
 * "trusts the caller's license filtering" reasoning. */
export async function getEinvoicesThisMonthCount(businessIds: string[]): Promise<number> {
  if (businessIds.length === 0) return 0;
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("einvoices")
    .select("id", { count: "exact", head: true })
    .in("business_id", businessIds)
    .eq("status", "generated")
    .gte("created_at", start);
  if (error) throw error;
  return count ?? 0;
}
