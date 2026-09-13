import type { AiRunSummary } from "../../lib/ai/queries";
import type { ResearchCacheStatus } from "../../lib/research/cache-status";

/**
 * DISC-OFFER-P1 §7-03.2 "Research Cache" -- every field the doc's own list asks for
 * (source, timestamp, expiry, input/context hash, research version, AI provider/model)
 * already exists in this codebase (`discovery.ai_runs` plus `prospect_research`'s own
 * `researched_at`/`expires_at`); this just surfaces them, and the existing "Re-research"
 * button (rendered by the caller, not this component) already is the "allow manual
 * refresh" this story asks for -- no new action needed.
 */
export function ResearchCacheStatusLine({ status, aiRun }: { status: ResearchCacheStatus; aiRun: AiRunSummary | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      {status.isExpired ? (
        <span className="font-medium text-amber-600 dark:text-amber-400">Cached research has expired -- consider re-researching. </span>
      ) : (
        <span>
          Cached {status.ageDays === 0 ? "today" : `${status.ageDays} day${status.ageDays === 1 ? "" : "s"} ago`}
          {status.daysUntilExpiry !== null ? `, expires in ${Math.max(0, status.daysUntilExpiry)} day${status.daysUntilExpiry === 1 ? "" : "s"}. ` : ". "}
        </span>
      )}
      {aiRun ? (
        <span>
          Via {aiRun.provider ?? "unknown provider"} ({aiRun.model}), research version {aiRun.prompt_version}.
        </span>
      ) : null}
    </p>
  );
}
