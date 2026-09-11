import { createClient } from "../../db/server";
import type { Activity } from "./types";

/** CRM-05.2's next-action display -- fetch the one activity a lead/opportunity's own
 * next_action_id points to. */
export async function getActivity(businessId: string, activityId: string): Promise<Activity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity")
    .select("*")
    .eq("id", activityId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data as Activity | null;
}

/** CRM-02.3's relationship timeline needs a party's full activity history (not just
 * the ones with a due date, unlike follow-ups) -- most recent first. */
export async function listActivitiesForParty(businessId: string, partyId: string): Promise<Activity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Activity[];
}
