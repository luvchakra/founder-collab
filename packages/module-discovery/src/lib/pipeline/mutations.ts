import { createClient } from "../../db/server";
import type { PipelineStage, PipelineStageKey } from "./types";

async function updateStage(
  workspaceId: string,
  stageKey: PipelineStageKey,
  patch: Record<string, unknown>,
): Promise<PipelineStage> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_stages")
    .update(patch)
    .eq("workspace_id", workspaceId)
    .eq("stage_key", stageKey)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Clears `failed_at`/`error` on (re)entry -- a stage that previously failed and is now
 * being retried shouldn't keep showing its old error once it's running again. */
export async function markPipelineStageRunning(workspaceId: string, stageKey: PipelineStageKey): Promise<PipelineStage> {
  return updateStage(workspaceId, stageKey, {
    status: "running",
    started_at: new Date().toISOString(),
    failed_at: null,
    error: null,
  });
}

export async function markPipelineStageCompleted(
  workspaceId: string,
  stageKey: PipelineStageKey,
  lastAiRunId?: string | null,
): Promise<PipelineStage> {
  return updateStage(workspaceId, stageKey, {
    status: "completed",
    completed_at: new Date().toISOString(),
    ...(lastAiRunId !== undefined ? { last_ai_run_id: lastAiRunId } : {}),
  });
}

export async function markPipelineStageFailed(workspaceId: string, stageKey: PipelineStageKey, message: string): Promise<PipelineStage> {
  return updateStage(workspaceId, stageKey, {
    status: "failed",
    failed_at: new Date().toISOString(),
    error: message,
  });
}

/** No account/discovery-definition/etc. found to act on this run -- a real, honest
 * outcome distinct from `failed` (nothing went wrong; there was simply nothing new to do,
 * e.g. re-running with no fresh accounts discovered). Same "don't collapse two different
 * true things into one status" discipline DISC-OFFER-P0-05.5's own
 * `insufficient_evidence` vs. `no_relevant_problem` split already established. */
export async function markPipelineStageSkipped(workspaceId: string, stageKey: PipelineStageKey): Promise<PipelineStage> {
  return updateStage(workspaceId, stageKey, {
    status: "skipped",
    completed_at: new Date().toISOString(),
  });
}
