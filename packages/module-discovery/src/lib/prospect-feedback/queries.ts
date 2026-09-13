import { cache } from "react";
import { createClient } from "../../db/server";
import type { ProspectFeedback } from "./types";

export const listProspectFeedback = cache(async (prospectId: string): Promise<ProspectFeedback[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_feedback")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});
