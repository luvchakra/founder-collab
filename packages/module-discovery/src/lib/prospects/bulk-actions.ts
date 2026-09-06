import { researchProspect } from "../ai/research-prospect";
import { scoreProspect } from "../scoring/score-prospect";
import { UsageLimitExceededError } from "../usage/limits";
import { listProspects } from "./queries";
import type { ProspectStage } from "./pipeline";

export type BulkActionResult = {
  completed: number;
  /** Ineligible (wrong stage), individually failed, or never attempted because the
   * monthly usage ceiling was hit first -- doc only asks for a completed count, so this
   * stays one number rather than a breakdown by reason. */
  skipped: number;
  limitReached: boolean;
};

/**
 * Orchestration only, reusing the existing per-prospect actions
 * (docs/prospects-pipeline-redesign-requirements.md R6) -- runs sequentially, not
 * Promise.all, so a hit monthly usage ceiling (assertWithinUsageLimit, checked inside
 * each per-prospect action) stops the batch after the prospect in flight instead of
 * firing every remaining call regardless. Only prospects actually at `eligibleStage`
 * among the selection are attempted; the rest are silently skipped rather than wasting
 * a call re-running a step that's already done.
 */
async function runBulk(
  workspaceId: string,
  prospectIds: string[],
  eligibleStage: ProspectStage,
  action: (prospectId: string) => Promise<unknown>,
): Promise<BulkActionResult> {
  const prospects = await listProspects(workspaceId, {});
  const eligibleIds = prospects
    .filter((p) => prospectIds.includes(p.id) && p.stage === eligibleStage)
    .map((p) => p.id);

  let completed = 0;
  let limitReached = false;

  for (const id of eligibleIds) {
    try {
      await action(id);
      completed++;
    } catch (error) {
      if (error instanceof UsageLimitExceededError) {
        limitReached = true;
        break;
      }
      // Any other single-prospect failure doesn't abort the rest of the batch.
    }
  }

  return { completed, skipped: prospectIds.length - completed, limitReached };
}

/** "Research all new" -- only prospects still at the "new" stage among the selection. */
export function bulkResearchProspects(
  workspaceId: string,
  prospectIds: string[],
): Promise<BulkActionResult> {
  return runBulk(workspaceId, prospectIds, "new", researchProspect);
}

/** "Score all researched" -- deterministic and free, but still only scores prospects
 * that have research and no score yet. */
export function bulkScoreProspects(
  workspaceId: string,
  prospectIds: string[],
): Promise<BulkActionResult> {
  return runBulk(workspaceId, prospectIds, "researched", scoreProspect);
}
