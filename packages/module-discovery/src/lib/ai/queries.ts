import { cache } from "react";
import { createClient } from "../../db/server";

export type AiRunSummary = {
  id: string;
  operation: string;
  model: string;
  provider: string | null;
  prompt_version: string;
  input_hash: string;
  created_at: string;
};

/** DISC-OFFER-P1 §7-03.2 "Research Cache" -- the exact `ai_runs` row a cached result
 * (e.g. `ProspectResearch.ai_run_id`) points back to, so a founder can see which
 * provider/model/version actually produced what's on screen. */
export const getAiRun = cache(async (aiRunId: string): Promise<AiRunSummary | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_runs")
    .select("id, operation, model, provider, prompt_version, input_hash, created_at")
    .eq("id", aiRunId)
    .maybeSingle();
  if (error) throw error;
  return data;
});
