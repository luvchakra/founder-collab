import { createClient } from "../../db/server";
import type { ProspectResearch } from "./types";

export async function getProspectResearch(
  prospectId: string,
): Promise<ProspectResearch | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_research")
    .select("*")
    .eq("prospect_id", prospectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
