// EXP-DISC-12 -- Discovery History export (/[businessSlug]/discovery/offerings/[productId]/history).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listPipelineRuns } from "../../lib/pipeline/queries";
import { PIPELINE_STAGE_LABEL, type PipelineRun } from "../../lib/pipeline/types";
import { listPipelineRunsForExport } from "./queries";
import { labelOf, readProductId, resolveOffering } from "./shared";

// The run history list's own wording (components/pipeline/run-history-list.tsx).
const TRIGGER_LABEL: Record<string, string> = {
  run_ai_discovery_cta: "Run AI Discovery",
  retry_failed_stage: "Retry failed stage",
  save_and_run_downstream: "Save & Run Downstream",
};
const STATUS_LABEL: Record<string, string> = { running: "Running", completed: "Completed", failed: "Failed" };

function durationSeconds(run: PipelineRun): number | null {
  if (!run.completed_at) return null;
  return Math.max(0, Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000));
}

function resultSummary(run: PipelineRun): string {
  if (run.status === "running") return "In progress";
  if (run.status === "failed") return run.error ? `Stopped: ${run.error}` : "Stopped";
  return "Completed every stage it attempted";
}

/**
 * The offering's discovery pipeline runs. The page shows the latest 50 (its own
 * `listPipelineRuns` limit), so "Current view" is exactly those and "All matching
 * records" pages through every run with the same predicate. A run still in progress has
 * no end or duration -- blank, not zero.
 */
export const discoveryHistoryExport: ExportAdapter<{ productId: string }> = {
  id: "discovery.history",
  module: "discovery",
  permissions: [],
  parseFilters: (params) => ({ productId: readProductId(params) }),
  describeFilters: (f) => ({ Offering: f.productId }),
  async load(context, filters) {
    const { product, workspace } = await resolveOffering(context, filters.productId);
    const runs = context.scope === "all" ? await listPipelineRunsForExport(workspace.id) : await listPipelineRuns(workspace.id);

    return {
      module: "discovery",
      resource: "history",
      title: "Discovery run history",
      metadata: { Offering: product.name },
      sheets: [
        {
          sheetName: "Runs",
          columns: [
            { key: "id", header: "Run ID", getValue: (r: PipelineRun) => r.id },
            { key: "started", header: "Started", type: "datetime", getValue: (r: PipelineRun) => r.started_at },
            { key: "ended", header: "Ended", type: "datetime", getValue: (r: PipelineRun) => r.completed_at },
            { key: "status", header: "Status", getValue: (r: PipelineRun) => labelOf(STATUS_LABEL, r.status) },
            { key: "trigger", header: "Trigger", getValue: (r: PipelineRun) => labelOf(TRIGGER_LABEL, r.trigger) },
            { key: "stage", header: "Starting stage", getValue: (r: PipelineRun) => labelOf(PIPELINE_STAGE_LABEL, r.starting_stage) },
            { key: "duration", header: "Duration (seconds)", type: "integer", getValue: durationSeconds },
            { key: "result", header: "Result summary", getValue: resultSummary },
            { key: "error", header: "Error", getValue: (r: PipelineRun) => r.error },
          ],
          rows: runs,
        },
      ],
    };
  },
};
