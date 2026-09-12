import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { PIPELINE_STAGE_LABEL } from "../../lib/pipeline/types";
import type { PipelineRun, PipelineRunStatus, PipelineRunTrigger, PipelineStageRun } from "../../lib/pipeline/types";

const TRIGGER_LABEL: Record<PipelineRunTrigger, string> = {
  run_ai_discovery_cta: "Run AI Discovery",
  retry_failed_stage: "Retry failed stage",
  save_and_run_downstream: "Save & Run Downstream",
};

const STATUS_BADGE_VARIANT: Record<PipelineRunStatus, "secondary" | "outline" | "destructive"> = {
  running: "secondary",
  completed: "outline",
  failed: "destructive",
};

const STATUS_LABEL: Record<PipelineRunStatus, string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

const STAGE_RUN_BADGE_VARIANT: Record<PipelineStageRun["status"], "secondary" | "outline" | "destructive"> = {
  completed: "outline",
  skipped: "secondary",
  failed: "destructive",
};

const STAGE_RUN_STATUS_LABEL: Record<PipelineStageRun["status"], string> = {
  completed: "Completed",
  skipped: "Nothing new",
  failed: "Failed",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

/** Deterministic, no AI call (CLAUDE.md dev principle #4) -- `ai_runs.operation` is
 * already a plain snake_case name (`understand_product`, `generate_icp`, ...); this only
 * reformats it for display. */
function formatOperation(operation: string): string {
  return operation
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * DISC-OFFER-P0-14.1: one Discovery Run History entry in full -- the doc's own field
 * list (`run_id`/`offering_id`/`started_at`/`completed_at`/`trigger`/`starting_stage`/
 * `status`/"AI provider/model where applicable"/"stages executed"/`errors`). `run_id`
 * itself and `offering_id` (this offering, already the page the founder is on) aren't
 * shown as their own fields -- an opaque id is not information a founder reviewing what
 * happened needs to see, the same restraint this module already applies to every other
 * internal id (opportunity/prospect ids are never rendered either, only what they name).
 */
export function RunHistoryDetail({
  businessId,
  productId,
  run,
  stagesExecuted,
  aiRuns,
}: {
  businessId: string;
  productId: string;
  run: PipelineRun;
  stagesExecuted: PipelineStageRun[];
  aiRuns: { operation: string; model: string; provider: string | null; status: "succeeded" | "failed" }[];
}) {
  const historyPath = `/dashboard/businesses/${businessId}/products/${productId}/history`;
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">{formatDateTime(run.started_at)}</h2>
          <Badge variant={STATUS_BADGE_VARIANT[run.status]}>{STATUS_LABEL[run.status]}</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Trigger</dt>
            <dd className="font-medium">{TRIGGER_LABEL[run.trigger]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Starting stage</dt>
            <dd className="font-medium">{PIPELINE_STAGE_LABEL[run.starting_stage]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Started</dt>
            <dd className="font-medium">{formatDateTime(run.started_at)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Completed</dt>
            <dd className="font-medium">{formatDateTime(run.completed_at)}</dd>
          </div>
        </dl>
        {run.error ? (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{run.error}</p>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">
          AI models used <span className="text-sm font-normal text-muted-foreground">({aiRuns.length})</span>
        </h3>
        {aiRuns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No AI calls during this run -- every stage it executed was deterministic.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {aiRuns.map((entry, i) => (
              <li
                key={`${entry.operation}-${entry.model}-${entry.provider ?? ""}-${entry.status}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{formatOperation(entry.operation)}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.model}
                    {entry.provider ? ` · ${entry.provider}` : ""}
                  </p>
                </div>
                {entry.status === "failed" ? <Badge variant="destructive">Failed</Badge> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">
          Stages executed <span className="text-sm font-normal text-muted-foreground">({stagesExecuted.length})</span>
        </h3>
        {stagesExecuted.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No stage finished during this run yet.
          </p>
        ) : (
          <ul className="divide-y rounded-2xl border border-border">
            {stagesExecuted.map((stageRun) => (
              <li key={stageRun.id} className="flex flex-col gap-1 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{PIPELINE_STAGE_LABEL[stageRun.stage_key]}</span>
                  <Badge variant={STAGE_RUN_BADGE_VARIANT[stageRun.status]}>{STAGE_RUN_STATUS_LABEL[stageRun.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(stageRun.started_at)} &rarr; {formatDateTime(stageRun.completed_at)}
                </p>
                {stageRun.error ? <p className="text-xs text-destructive">{stageRun.error}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href={historyPath} className="text-sm font-medium text-primary hover:underline">
        &larr; Back to run history
      </Link>
    </div>
  );
}
