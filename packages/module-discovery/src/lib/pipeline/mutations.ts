import { createClient } from "../../db/server";
import type { PipelineRun, PipelineRunStatus, PipelineRunTrigger, PipelineStage, PipelineStageKey } from "./types";

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

/** DISC-OFFER-P0-10.2: records this stage's own just-finished attempt as a permanent,
 * standalone row -- what a retry's own `updateStage` call above would otherwise silently
 * overwrite on the current-state row. `startedAt` falls back to "now" only for the
 * pathological case of a stage somehow reaching a terminal state with no recorded start
 * (should not happen in practice -- every terminal mutation below is only ever called
 * after `markPipelineStageRunning` set one). */
async function recordPipelineStageRun(
  workspaceId: string,
  stageKey: PipelineStageKey,
  version: number,
  status: "completed" | "failed" | "skipped",
  startedAt: string | null,
  completedAt: string,
  error: string | null,
  runId: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error: insertError } = await supabase.from("pipeline_stage_runs").insert({
    workspace_id: workspaceId,
    stage_key: stageKey,
    version,
    status,
    started_at: startedAt ?? completedAt,
    completed_at: completedAt,
    error,
    run_id: runId,
  });
  if (insertError) throw insertError;
}

/** Clears `failed_at`/`error` on (re)entry -- a stage that previously failed and is now
 * being retried shouldn't keep showing its old error once it's running again. Increments
 * `version` on every entry (DISC-OFFER-P0-10.2: 1 for the first run, 2 after one retry,
 * and so on) -- an explicit read-then-write rather than a raw SQL increment since the
 * Supabase JS client has no atomic column-increment helper; concurrent runs of the same
 * stage are already prevented by the caller only ever driving one stage at a time per
 * offering (the run-ai-discovery panel), the same single-flight assumption
 * `discoverProspects`' own per-workspace lock formalizes for its own operation. */
export async function markPipelineStageRunning(workspaceId: string, stageKey: PipelineStageKey): Promise<PipelineStage> {
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("pipeline_stages")
    .select("version")
    .eq("workspace_id", workspaceId)
    .eq("stage_key", stageKey)
    .single();
  if (readError) throw readError;

  return updateStage(workspaceId, stageKey, {
    status: "running",
    started_at: new Date().toISOString(),
    failed_at: null,
    error: null,
    version: current.version + 1,
  });
}

export async function markPipelineStageCompleted(
  workspaceId: string,
  stageKey: PipelineStageKey,
  lastAiRunId?: string | null,
  runId?: string | null,
): Promise<PipelineStage> {
  const completedAt = new Date().toISOString();
  const stage = await updateStage(workspaceId, stageKey, {
    status: "completed",
    completed_at: completedAt,
    ...(lastAiRunId !== undefined ? { last_ai_run_id: lastAiRunId } : {}),
  });
  await recordPipelineStageRun(workspaceId, stageKey, stage.version, "completed", stage.started_at, completedAt, null, runId ?? null);
  return stage;
}

export async function markPipelineStageFailed(
  workspaceId: string,
  stageKey: PipelineStageKey,
  message: string,
  runId?: string | null,
): Promise<PipelineStage> {
  const failedAt = new Date().toISOString();
  const stage = await updateStage(workspaceId, stageKey, {
    status: "failed",
    failed_at: failedAt,
    error: message,
  });
  await recordPipelineStageRun(workspaceId, stageKey, stage.version, "failed", stage.started_at, failedAt, message, runId ?? null);
  return stage;
}

/** No account/discovery-definition/etc. found to act on this run -- a real, honest
 * outcome distinct from `failed` (nothing went wrong; there was simply nothing new to do,
 * e.g. re-running with no fresh accounts discovered). Same "don't collapse two different
 * true things into one status" discipline DISC-OFFER-P0-05.5's own
 * `insufficient_evidence` vs. `no_relevant_problem` split already established. */
export async function markPipelineStageSkipped(
  workspaceId: string,
  stageKey: PipelineStageKey,
  runId?: string | null,
): Promise<PipelineStage> {
  const completedAt = new Date().toISOString();
  const stage = await updateStage(workspaceId, stageKey, {
    status: "skipped",
    completed_at: completedAt,
  });
  await recordPipelineStageRun(workspaceId, stageKey, stage.version, "skipped", stage.started_at, completedAt, null, runId ?? null);
  return stage;
}

/** DISC-OFFER-P0-11.3: resets one stage back to `not_started` without recording a
 * `pipeline_stage_runs` row -- unlike the three terminal mutations above, nothing
 * actually *finished* here (a manual invalidation isn't an execution attempt with its own
 * outcome), so there's nothing to preserve as history yet. Deliberately does not touch
 * `version`/`last_ai_run_id` either -- the next real run through `markPipelineStageRunning`
 * still increments `version` from wherever it was, so the version sequence itself has no
 * gap, it just resumes. Exported for `lib/pipeline/invalidate.ts`'s own use, not called
 * directly from route handlers. */
export async function resetPipelineStageToNotStarted(workspaceId: string, stageKey: PipelineStageKey): Promise<PipelineStage> {
  return updateStage(workspaceId, stageKey, {
    status: "not_started",
    started_at: null,
    completed_at: null,
    failed_at: null,
    error: null,
  });
}

/** DISC-OFFER-P0-14.1: opens one "Discovery Run History" row for a client-driven walk
 * through the pipeline, before the first stage in that walk actually starts -- called
 * once per `runFrom()` invocation (`run-ai-discovery-panel.tsx`), not once per technical
 * stage. `startingStage` is this walk's own first stage, whichever of the three trigger
 * points (see `PipelineRunTrigger`'s own comment) determined it. */
export async function startPipelineRun(
  workspaceId: string,
  trigger: PipelineRunTrigger,
  startingStage: PipelineStageKey,
): Promise<PipelineRun> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pipeline_runs")
    .insert({ workspace_id: workspaceId, trigger, starting_stage: startingStage })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Closes a run once the client's own walk stops -- either every stage it attempted
 * through to `crm_handoff` succeeded (`completed`), or one of them didn't and the
 * client's own loop broke (`failed`, with that stage's own error message). Scoped by
 * `workspaceId` as well as `id`, same defense-in-depth double filter `updateStage` above
 * already applies to every stage mutation, even though `id` alone would already be
 * enough to select at most one row. */
export async function completePipelineRun(
  workspaceId: string,
  runId: string,
  status: Exclude<PipelineRunStatus, "running">,
  error: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("pipeline_runs")
    .update({ status, completed_at: new Date().toISOString(), error })
    .eq("workspace_id", workspaceId)
    .eq("id", runId);
  if (updateError) throw updateError;
}
