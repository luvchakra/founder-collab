"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { PIPELINE_STAGE_KEYS, PIPELINE_STAGE_LABEL, type PipelineStage, type PipelineStageKey } from "../../lib/pipeline/types";

type StageResponse = { ok: true; stage: PipelineStage; detail: string } | { ok: false; stage: PipelineStage; error: string };

function firstIncompleteIndex(stages: PipelineStage[]): number {
  const index = PIPELINE_STAGE_KEYS.findIndex((key) => {
    const status = stages.find((s) => s.stage_key === key)?.status ?? "not_started";
    return status !== "completed" && status !== "skipped";
  });
  return index === -1 ? PIPELINE_STAGE_KEYS.length : index;
}

/**
 * DISC-OFFER-P0-10.1: "Run AI Discovery CTA" -- the doc's own exact button copy and
 * supporting line. "The button must make it obvious that clicking it starts an automated
 * research process" -- literal label, no "Continue"/"Process"/"Generate".
 *
 * Drives the fourteen-stage pipeline one request per stage (see run-ai-discovery/
 * route.ts's own comment for why), rendering a plain ordered checklist rather than
 * DISC-OFFER-P0-10.3's own polished non-technical mockup (✓/●/○ with per-stage "Review"/
 * "Run From Here") -- that visual/UX pass is 10.3's own explicit scope; this is the
 * minimum real, working progress view 10.1's own "Progress is visible" acceptance
 * criterion needs: every stage's current persisted status, a spinner on whichever one is
 * in flight, and a Retry action on whichever one failed.
 */
export function RunAiDiscoveryPanel({
  businessId,
  productId,
  initialStages,
}: {
  businessId: string;
  productId: string;
  initialStages: PipelineStage[];
}) {
  const [stages, setStages] = useState(initialStages);
  const [runningKey, setRunningKey] = useState<PipelineStageKey | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);

  const endpoint = `/dashboard/businesses/${businessId}/products/${productId}/run-ai-discovery`;

  function statusOf(key: PipelineStageKey) {
    return stages.find((s) => s.stage_key === key)?.status ?? "not_started";
  }
  function stageOf(key: PipelineStageKey) {
    return stages.find((s) => s.stage_key === key) ?? null;
  }

  async function runOneStage(key: PipelineStageKey): Promise<boolean> {
    setRunningKey(key);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey: key }),
      });
      const result = (await response.json()) as StageResponse;
      setStages((prev) => prev.map((s) => (s.stage_key === key ? result.stage : s)));
      return result.ok;
    } catch {
      return false;
    } finally {
      setRunningKey(null);
    }
  }

  async function runFrom(startKey?: PipelineStageKey) {
    if (autoRunning) return;
    setAutoRunning(true);
    try {
      const startIndex = startKey ? PIPELINE_STAGE_KEYS.indexOf(startKey) : firstIncompleteIndex(stages);
      for (let i = startIndex; i < PIPELINE_STAGE_KEYS.length; i += 1) {
        const ok = await runOneStage(PIPELINE_STAGE_KEYS[i]!);
        if (!ok) break;
      }
    } finally {
      setAutoRunning(false);
    }
  }

  const allDone = stages.length === PIPELINE_STAGE_KEYS.length && stages.every((s) => s.status === "completed" || s.status === "skipped");
  const hasStarted = stages.some((s) => s.status !== "not_started");

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">AI Discovery</p>
          <p className="text-sm text-muted-foreground">
            Automatically research this offering, build its ICP, identify buyers and signals, find opportunities, and prepare
            recommended actions.
          </p>
        </div>
        <Button onClick={() => runFrom()} disabled={autoRunning} className="shrink-0">
          {autoRunning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {allDone ? "Run AI Discovery Again" : hasStarted ? "Resume AI Discovery" : "Run AI Discovery"}
        </Button>
      </div>

      <ol className="flex flex-col gap-1.5">
        {PIPELINE_STAGE_KEYS.map((key) => {
          const status = statusOf(key);
          const stage = stageOf(key);
          const isRunning = runningKey === key || status === "running";
          return (
            <li key={key} className="flex flex-col gap-1 rounded-md px-2 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                {status === "completed" || status === "skipped" ? (
                  <CheckCircle2 className={status === "skipped" ? "size-4 text-muted-foreground" : "size-4 text-primary"} />
                ) : isRunning ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : status === "failed" ? (
                  <XCircle className="size-4 text-destructive" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={status === "not_started" ? "text-muted-foreground" : ""}>{PIPELINE_STAGE_LABEL[key]}</span>
                {status === "skipped" ? <span className="text-xs text-muted-foreground">Nothing new</span> : null}
                {status === "failed" ? (
                  <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2" onClick={() => runFrom(key)} disabled={autoRunning}>
                    <RotateCcw className="size-3.5" />
                    Retry
                  </Button>
                ) : null}
              </div>
              {status === "failed" && stage?.error ? <p className="pl-6 text-xs text-destructive">{stage.error}</p> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
