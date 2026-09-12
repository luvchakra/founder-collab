import { createClient } from "../../db/server";
import { PIPELINE_STAGE_KEYS, type PipelineRun, type PipelineStage, type PipelineStageKey, type PipelineStageRun } from "./types";

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

/** DISC-OFFER-P0-10.2: every past attempt at one stage, most recent first -- what
 * "reruns create new versions rather than silently destroying history" actually needs a
 * way to read back. No UI consumes this yet (10.2 itself has no UI acceptance criteria);
 * exported now because a history table nothing can read back would leave "persistent"
 * only half true, the same reasoning DISC-OFFER-P0-02.3's own `listBuyerPersonas` was
 * exported ahead of DISC-OFFER-P0-06.3 actually consuming it. */
export async function listPipelineStageRuns(workspaceId: string, stageKey: PipelineStageKey): Promise<PipelineStageRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stage_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("stage_key", stageKey)
    .order("version", { ascending: false });
  if (error) throw error;
  return data;
}

/** DISC-OFFER-P0-14.1: this offering's own "Discovery Run History" -- most recent walk
 * through the pipeline first. Capped at 50 (a plain, generous recency window -- this is
 * an audit log a founder scrolls, not a paginated report this story asks for). */
export async function listPipelineRuns(workspaceId: string, limit = 50): Promise<PipelineRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/** One run, scoped to its own workspace -- used both to render a single run's own detail
 * and, in `run-ai-discovery/route.ts`, to validate a client-supplied `runId` actually
 * belongs to the caller's own workspace before trusting it (CLAUDE.md dev principle #8:
 * never trust a client-supplied tenant-scoped id without server-side authorization) --
 * RLS already prevents *reading another workspace's row*, but a bare `id` FK on
 * `pipeline_stage_runs.run_id` would otherwise still accept a syntactically valid id for
 * a run that exists yet belongs to a workspace the caller has nothing to do with. */
export async function getPipelineRun(workspaceId: string, runId: string): Promise<PipelineRun | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** DISC-OFFER-P0-14.1's own "stages executed" -- every technical stage attempt made
 * during one specific run, in the order they actually ran. Deliberately reads
 * `pipeline_stage_runs` (10.2's own append-only attempt log) rather than a duplicate
 * column on `pipeline_runs` -- see that table's own migration comment. */
export async function listPipelineStageRunsForRun(workspaceId: string, runId: string): Promise<PipelineStageRun[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stage_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
