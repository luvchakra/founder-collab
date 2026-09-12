import { createClient } from "../../db/server";
import { PIPELINE_STAGE_KEYS, type PipelineStage } from "./types";

/** Seeds every stage key this workspace is still missing a row for, as `not_started` --
 * idempotent (an `on conflict do nothing` upsert keyed on the table's own
 * `(workspace_id, stage_key)` uniqueness), so it's safe to call on every page render
 * (`listPipelineStages`) and every orchestrator run alike. A freshly-created offering has
 * no rows yet; this is what makes "every stage has a persisted status" true from the very
 * first time the offering's Overview page is opened, not only after the CTA is clicked. */
async function ensurePipelineStagesSeeded(workspaceId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pipeline_stages")
    .upsert(
      PIPELINE_STAGE_KEYS.map((stage_key) => ({ workspace_id: workspaceId, stage_key })),
      { onConflict: "workspace_id,stage_key", ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** Not `cache()`-wrapped like most read queries in this module: the orchestrator calls
 * this repeatedly within one streamed run to re-read the latest state between stages, and
 * request-level memoization would return the first call's stale snapshot for the rest of
 * that same request. */
export async function listPipelineStages(workspaceId: string): Promise<PipelineStage[]> {
  await ensurePipelineStagesSeeded(workspaceId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("*")
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  // Re-sorted into the pipeline's own execution order -- the seed upsert and Postgres's
  // own storage order give no ordering guarantee, and every caller (the orchestrator, the
  // progress UI) needs stage 1 before stage 2.
  const byKey = new Map(data.map((s) => [s.stage_key, s]));
  return PIPELINE_STAGE_KEYS.map((key) => byKey.get(key)).filter((s): s is PipelineStage => Boolean(s));
}
