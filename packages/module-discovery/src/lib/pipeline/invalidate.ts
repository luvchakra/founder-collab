import { createClient } from "../../db/server";
import { downstreamOf } from "./dependencies";
import { activeOpportunities, requireActiveDefinition } from "./handlers";
import { resetPipelineStageToNotStarted } from "./mutations";
import type { PipelineStageKey } from "./types";

/** Which of an opportunity's own columns a given stage is responsible for -- the
 * columns `invalidateDownstreamStages` below clears when that stage is invalidated, so
 * the existing per-stage handlers (`lib/pipeline/handlers.ts`, DISC-OFFER-P0-10.1) -- each
 * already written to skip an opportunity that already has the field it's responsible for
 * -- naturally pick it back up as pending rather than silently skipping it forever.
 * Stages with no column of their own here (`buyer_personas`/`discovery_strategy`/
 * `account_discovery`/`signals`/`opportunity_scoring`/`crm_handoff`) either only ever
 * *add* rows (never overwrite, so nothing needs clearing to be redone) or are pure
 * checkpoint/read-only stages with no column of their own (see each one's own comment in
 * `handlers.ts`) -- omitted here deliberately, not by oversight. */
const CLEARABLE_OPPORTUNITY_COLUMNS: Partial<Record<PipelineStageKey, Record<string, null>>> = {
  signal_correlation: { signal_correlation_id: null, signal_strength_score: null },
  why_now: { why_now: null, timing_strength: null, why_now_confidence: null, timing_score: null },
  research: { why_them: null },
  buyer_intelligence: { buyer_fit_score: null, contactability_score: null },
  recommended_action: { recommended_action: null, recommended_action_reason: null },
};

/**
 * DISC-OFFER-P0-11.3: "Only affected downstream stages should rerun" -- resets exactly
 * the stages `downstreamOf(fromStageKey)` names (never `fromStageKey` itself, and never
 * anything upstream of it) back to `not_started`, and clears whichever of those stages'
 * own opportunity columns exist so a subsequent pipeline run genuinely recomputes them
 * rather than skipping already-populated data (DISC-OFFER-P0-10.1's own handlers are
 * deliberately idempotent/incremental -- this is what makes them redo work on purpose).
 * A no-op (returns an empty list) when there is no active discovery definition yet or no
 * open opportunities under it -- an upstream edit before any real discovery run has
 * happened has nothing downstream to invalidate.
 */
export async function invalidateDownstreamStages(workspaceId: string, fromStageKey: PipelineStageKey): Promise<PipelineStageKey[]> {
  const affected = downstreamOf(fromStageKey);
  if (affected.length === 0) return [];

  for (const stageKey of affected) {
    await resetPipelineStageToNotStarted(workspaceId, stageKey);
  }

  const definition = await requireActiveDefinition(workspaceId).catch(() => null);
  if (!definition) return affected;
  const opportunities = await activeOpportunities(workspaceId, definition.id);
  if (opportunities.length === 0) return affected;

  const supabase = await createClient();
  for (const stageKey of affected) {
    const columns = CLEARABLE_OPPORTUNITY_COLUMNS[stageKey];
    if (!columns) continue;
    const { error } = await supabase
      .from("opportunities")
      .update(columns)
      .in(
        "id",
        opportunities.map((o) => o.id),
      );
    if (error) throw error;
  }

  return affected;
}
