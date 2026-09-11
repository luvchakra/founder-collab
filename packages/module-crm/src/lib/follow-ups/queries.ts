import { createClient } from "../../db/server";
import type { FollowUp } from "./types";

/** CRM-01.3's `listOpenFollowUps()` contract operation. The full queue UI (due today /
 * overdue / upcoming / unassigned / high-priority views, filters) is CRM-05.3's own
 * story -- this returns pending follow-ups ordered soonest-due-first, the one shape
 * every one of those views is filtered from. */
export async function listOpenFollowUps(businessId: string, ownerId?: string): Promise<FollowUp[]> {
  const supabase = await createClient();
  let query = supabase.from("follow_up").select("*").eq("business_id", businessId).eq("status", "pending").order("due_at", { ascending: true });
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query;
  if (error) throw error;
  return data as FollowUp[];
}
