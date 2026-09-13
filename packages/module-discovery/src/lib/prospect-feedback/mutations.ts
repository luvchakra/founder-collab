import { createClient } from "../../db/server";
import type { ProspectFeedback, ProspectFeedbackTag } from "./types";

export async function addProspectFeedback(
  workspaceId: string,
  prospectId: string,
  tag: ProspectFeedbackTag,
  note: string | null,
): Promise<ProspectFeedback> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_feedback")
    .insert({ workspace_id: workspaceId, prospect_id: prospectId, feedback_tag: tag, note })
    .select()
    .single();
  if (error) throw error;
  return data;
}
