import { createClient } from "../../db/server";
import type { ProspectScore } from "./types";

/** Latest score -- prospect_scores is append-only (R8), so "the score" is the most
 * recent row rather than a single upserted one. */
export async function getProspectScore(prospectId: string): Promise<ProspectScore | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_scores")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Most recent scores, newest first -- [0] is current, [1] is previous, for the
 * detail page's trend display (docs/prospects-pipeline-redesign-requirements.md R8). */
export async function listRecentProspectScores(
  prospectId: string,
  limit = 2,
): Promise<ProspectScore[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prospect_scores")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}
