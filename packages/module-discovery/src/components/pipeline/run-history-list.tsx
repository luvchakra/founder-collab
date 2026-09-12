import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { PIPELINE_STAGE_LABEL } from "../../lib/pipeline/types";
import type { PipelineRun, PipelineRunStatus, PipelineRunTrigger } from "../../lib/pipeline/types";

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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Whole minutes/seconds only -- a run spans real AI calls (seconds to low minutes), so
 * sub-second precision would be false precision (CLAUDE.md's own "no false precision"
 * discipline, already applied throughout this backlog) rather than useful detail. */
function formatDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return "In progress";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return "<1s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * DISC-OFFER-P0-14.1: "Discovery Run History" -- the doc's own field list rendered as a
 * plain audit list, most recent walk through the pipeline first. Each row links to its
 * own detail page (`stages executed`/`AI provider or model`/full error text) rather than
 * cramming all of that into this list -- the same "the real page is the way to see the
 * rest" call `run-ai-discovery-panel.tsx` (DISC-OFFER-P0-10.3) already made for a
 * completed group's own destination link, not a second place inventing its own way to
 * show it. Desktop gets a real table, mobile gets one card per row (CLAUDE.md
 * non-negotiable #12), the same split `OpportunitiesDashboard` (DISC-OFFER-P0-07.2)
 * already established.
 */
export function RunHistoryList({ businessId, productId, runs }: { businessId: string; productId: string; runs: PipelineRun[] }) {
  if (runs.length === 0) {
    return <EmptyState message="No discovery runs yet. They'll appear here once AI Discovery runs for this offering." />;
  }

  const basePath = `/dashboard/businesses/${businessId}/products/${productId}/history`;

  return (
    <div className="rounded-2xl border border-border">
      {/* Mobile: one card per row (CLAUDE.md #12) */}
      <ul className="divide-y md:hidden">
        {runs.map((run) => (
          <li key={run.id}>
            <Link href={`${basePath}/${run.id}`} className="flex flex-col gap-2 p-3 text-sm hover:bg-accent">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{formatDateTime(run.started_at)}</span>
                <Badge variant={STATUS_BADGE_VARIANT[run.status]}>{STATUS_LABEL[run.status]}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{TRIGGER_LABEL[run.trigger]}</span>
                <span>From: {PIPELINE_STAGE_LABEL[run.starting_stage]}</span>
                <span>{formatDuration(run.started_at, run.completed_at)}</span>
              </div>
              {run.error ? <p className="line-clamp-2 text-xs text-destructive">{run.error}</p> : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop: proto-table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Started</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Starting stage</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell>
                <Link href={`${basePath}/${run.id}`} className="font-medium hover:underline">
                  {formatDateTime(run.started_at)}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{TRIGGER_LABEL[run.trigger]}</TableCell>
              <TableCell className="text-muted-foreground">{PIPELINE_STAGE_LABEL[run.starting_stage]}</TableCell>
              <TableCell className="text-muted-foreground">{formatDuration(run.started_at, run.completed_at)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[run.status]}>{STATUS_LABEL[run.status]}</Badge>
              </TableCell>
              <TableCell className="max-w-56">
                {run.error ? <span className="line-clamp-2 text-destructive">{run.error}</span> : <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
