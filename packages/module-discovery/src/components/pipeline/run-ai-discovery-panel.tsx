"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Circle, HelpCircle, Loader2, RotateCcw, Sparkles, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@cofounderai/core/ui/button";
import { computeDisplayGroups, isStageStatusDone, type DisplayGroupKey } from "../../lib/pipeline/display-groups";
import { STAGE_REVIEW_LABEL } from "../../lib/pipeline/review";
import {
  PIPELINE_STAGE_KEYS,
  PIPELINE_STAGE_LABEL,
  type PipelineRun,
  type PipelineRunTrigger,
  type PipelineStage,
  type PipelineStageKey,
} from "../../lib/pipeline/types";

type StageResponse = { ok: true; stage: PipelineStage; detail: string } | { ok: false; stage: PipelineStage; error: string };
type StartRunResponse = { ok: true; run: PipelineRun } | { ok: false; error: string };

function firstIncompleteIndex(stages: PipelineStage[]): number {
  const index = PIPELINE_STAGE_KEYS.findIndex((key) => {
    const status = stages.find((s) => s.stage_key === key)?.status ?? "not_started";
    return !isStageStatusDone(status);
  });
  return index === -1 ? PIPELINE_STAGE_KEYS.length : index;
}

/** DISC-OFFER-P0-10.3: where a group's own underlying data actually lives, for "Users
 * can inspect completed stages" -- a plain link to the real page already showing it,
 * rather than a second read-only viewer duplicating that page's own content (the same
 * "the edit dialog is the way to see the rest" call DISC-OFFER-P0-01.3 already made).
 * `website_understanding`/`offering_profile` have no link -- their own result is this
 * very Overview page, immediately below this panel. */
const GROUP_DESTINATION: Partial<Record<DisplayGroupKey, { label: string; tab: string }>> = {
  icp: { label: "View ICP", tab: "icp" },
  buyer_personas: { label: "View buyer personas", tab: "icp" },
  discovery_strategy: { label: "View discovery strategy", tab: "discovery" },
  signal_intelligence: { label: "View prospects", tab: "prospects" },
  opportunity_scoring: { label: "View opportunities", tab: "opportunities" },
  research: { label: "View opportunities", tab: "opportunities" },
  recommended_action: { label: "View opportunities", tab: "opportunities" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * DISC-OFFER-P0-10.1/10.3: "Run AI Discovery CTA" + "Pipeline Progress UI". The doc's own
 * exact button copy and supporting line ("The button must make it obvious that clicking
 * it starts an automated research process" -- literal label, no "Continue"/"Process"/
 * "Generate"), and the doc's own nine-line non-technical progress mockup (✓/●/○) --
 * `computeDisplayGroups` collapses DISC-OFFER-P0-10.2's fourteen persisted technical
 * stages into those same nine founder-facing lines. Drives the pipeline one HTTP request
 * per *technical* stage (see run-ai-discovery/route.ts's own comment for why one long
 * stream would be unsafe here), so a group spanning several technical stages advances
 * through them one request at a time while showing a single, stable line the whole time.
 *
 * "Users can inspect completed stages": clicking any group expands it to show each of its
 * own underlying technical stages' status/timestamp, plus a link to wherever that group's
 * real result already lives elsewhere in the app -- not a second, duplicate display of
 * the same data. "Retry failed stages": the Retry button on a failed group re-runs from
 * the one technical stage that actually failed, not the whole group.
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
  const [expanded, setExpanded] = useState<Set<DisplayGroupKey>>(new Set());
  // DISC-OFFER-P1-05.1: "Offering Pipeline Workspace" -- the doc's own mockup shows real
  // per-stage counts under the current stage ("18 relevant signals found", "6
  // high-confidence correlations"). Every stage handler already produces exactly this
  // kind of one-line summary (`StageOutcome.detail`, e.g. "Signals collected for 4 of 5
  // account(s)."), but it was previously discarded after each request -- never persisted
  // anywhere (`pipeline_stages` has no summary column, by design: `detail` is a
  // human-readable narration of one attempt, not state to snapshot). Kept here in plain
  // client state, keyed by technical stage, so the Current Stage card below can show the
  // real detail from whichever request most recently touched it -- only ever populated
  // for stages this browser session actually ran, which is the honest scope of what's
  // knowable without inventing a new persisted column for a value nothing else needs.
  const [stageDetails, setStageDetails] = useState<Partial<Record<PipelineStageKey, string>>>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoRunStarted = useRef(false);

  const endpoint = `/dashboard/businesses/${businessId}/products/${productId}/run-ai-discovery`;
  const basePath = `/dashboard/businesses/${businessId}/products/${productId}`;

  // DISC-OFFER-P0-11.2: "Run Discovery From Here" -- a "Save & Run Downstream" edit
  // elsewhere (e.g. the ICP page) invalidates the affected stages server-side, then sends
  // the founder back here with `?autorun=1` so the two actions ("save my edit" and "rerun
  // what depends on it") read as one continuous action rather than a save followed by a
  // second, separate manual click -- the same auto-start-on-arrival pattern
  // `WebsiteOnboardingPanel` (DISC-OFFER-P0-09.1) already uses for a freshly-created
  // `pending` run. The query param is stripped immediately (`router.replace`) so a later
  // reload of this same URL doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get("autorun") === "1" && !autoRunStarted.current) {
      autoRunStarted.current = true;
      router.replace(basePath);
      void runFrom(undefined, "save_and_run_downstream");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function stageOf(key: PipelineStageKey) {
    return stages.find((s) => s.stage_key === key) ?? null;
  }

  async function runOneStage(key: PipelineStageKey, runId: string | null): Promise<boolean> {
    setRunningKey(key);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey: key, runId }),
      });
      const result = (await response.json()) as StageResponse;
      setStages((prev) => prev.map((s) => (s.stage_key === key ? result.stage : s)));
      if (result.ok) setStageDetails((prev) => ({ ...prev, [key]: result.detail }));
      return result.ok;
    } catch {
      return false;
    } finally {
      setRunningKey(null);
    }
  }

  /** DISC-OFFER-P0-14.1: opens one Discovery Run History row for this whole walk before
   * the first stage in it runs, so every per-stage request below can attach to it --
   * best-effort (a failed/unreachable "start run" call still lets the pipeline itself run
   * normally with `runId: null`, same "never let logging break the real result"
   * discipline `recordAiRun` already established for `ai_runs`). */
  async function runFrom(startKey: PipelineStageKey | undefined, trigger: PipelineRunTrigger) {
    if (autoRunning) return;
    const startIndex = startKey ? PIPELINE_STAGE_KEYS.indexOf(startKey) : firstIncompleteIndex(stages);
    if (startIndex >= PIPELINE_STAGE_KEYS.length) return;

    setAutoRunning(true);
    try {
      let runId: string | null = null;
      try {
        const startResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start_run", trigger, startingStage: PIPELINE_STAGE_KEYS[startIndex] }),
        });
        const startResult = (await startResponse.json()) as StartRunResponse;
        runId = startResult.ok ? startResult.run.id : null;
      } catch {
        runId = null;
      }

      for (let i = startIndex; i < PIPELINE_STAGE_KEYS.length; i += 1) {
        const ok = await runOneStage(PIPELINE_STAGE_KEYS[i]!, runId);
        if (!ok) break;
      }
    } finally {
      setAutoRunning(false);
    }
  }

  function toggleExpanded(key: DisplayGroupKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groups = computeDisplayGroups(stages);
  const allDone = groups.every((g) => g.status === "completed");
  const hasStarted = stages.some((s) => s.status !== "not_started");
  // DISC-OFFER-P1-05.1: the doc's own "Current Stage" box -- only ever the group
  // `computeDisplayGroups` calls "current" (at most one at a time, mirroring the doc's
  // own single "●" line), and only once something has actually started: before the
  // first click, "current" would just be "Website Understanding" with nothing yet run,
  // which would duplicate the checklist's own first line rather than add information.
  const currentGroup = hasStarted ? groups.find((g) => g.status === "current") : undefined;
  const currentGroupDetail = currentGroup?.activeStageKey ? stageDetails[currentGroup.activeStageKey] : undefined;
  const currentGroupDestination = currentGroup ? GROUP_DESTINATION[currentGroup.key] : undefined;

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
        <Button onClick={() => runFrom(undefined, "run_ai_discovery_cta")} disabled={autoRunning} className="shrink-0">
          {autoRunning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {allDone ? "Run AI Discovery Again" : hasStarted ? "Resume AI Discovery" : "Run AI Discovery"}
        </Button>
      </div>

      <ol className="flex flex-col gap-1">
        {groups.map((group) => {
          const isOpen = expanded.has(group.key);
          const isRunning =
            group.status === "current" &&
            group.activeStageKey !== null &&
            (runningKey === group.activeStageKey || stageOf(group.activeStageKey)?.status === "running");
          const destination = GROUP_DESTINATION[group.key];

          return (
            <li key={group.key} className="rounded-md text-sm">
              <button
                type="button"
                onClick={() => toggleExpanded(group.key)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              >
                {isOpen ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                {group.status === "completed" ? (
                  group.reviewLevel === "needs_review" ? (
                    <AlertTriangle className="size-4 text-amber-600" />
                  ) : group.reviewLevel === "insufficient_evidence" ? (
                    <HelpCircle className="size-4 text-muted-foreground" />
                  ) : (
                    <CheckCircle2 className="size-4 text-primary" />
                  )
                ) : isRunning ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : group.status === "failed" ? (
                  <XCircle className="size-4 text-destructive" />
                ) : group.status === "current" ? (
                  <span className="flex size-4 items-center justify-center">
                    <span className="size-2 rounded-full bg-primary" />
                  </span>
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
                <span className={group.status === "upcoming" ? "text-muted-foreground" : ""}>{group.label}</span>
                {group.status === "completed" && group.reviewLevel !== "automated" ? (
                  <span className="text-xs text-muted-foreground">({STAGE_REVIEW_LABEL[group.reviewLevel]})</span>
                ) : null}
                {group.status === "failed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 gap-1 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (group.activeStageKey) void runFrom(group.activeStageKey, "retry_failed_stage");
                    }}
                    disabled={autoRunning}
                  >
                    <RotateCcw className="size-3.5" />
                    Retry
                  </Button>
                ) : null}
              </button>

              {isOpen ? (
                <div className="flex flex-col gap-1.5 py-1 pl-9 pr-2 text-xs text-muted-foreground">
                  {group.stageKeys.map((stageKey) => {
                    const stage = stageOf(stageKey);
                    return (
                      <div key={stageKey} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">{PIPELINE_STAGE_LABEL[stageKey]}</span>
                        <span>
                          {stage?.status === "completed"
                            ? `Completed ${formatTime(stage.completed_at)}`
                            : stage?.status === "needs_review"
                              ? `Needs review ${formatTime(stage.completed_at)}`
                              : stage?.status === "insufficient_evidence"
                                ? `Insufficient evidence ${formatTime(stage.completed_at)}`
                                : stage?.status === "skipped"
                                  ? "Nothing new"
                                  : stage?.status === "failed"
                                    ? (stage.error ?? "Failed")
                                    : stage?.status === "running"
                                      ? "Running..."
                                      : "Not started"}
                        </span>
                      </div>
                    );
                  })}
                  {destination ? (
                    <Link href={`${basePath}/${destination.tab}`} className="pt-0.5 font-medium text-primary hover:underline">
                      {destination.label} &rarr;
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {currentGroup ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Current stage</p>
            <span className="text-sm font-semibold">{currentGroup.label}</span>
          </div>
          {currentGroupDetail ? <p className="text-sm text-muted-foreground">{currentGroupDetail}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => toggleExpanded(currentGroup.key)}>
              Review Stage
            </Button>
            {currentGroupDestination ? (
              <Link href={`${basePath}/${currentGroupDestination.tab}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Edit
              </Link>
            ) : null}
            {/* DISC-OFFER-P1-05.1's own "[Run From Here]" is deliberately not repeated here:
             * "current" is defined as the first not-yet-done group (`computeDisplayGroups`),
             * the exact same starting point `runFrom(undefined, ...)` already resumes from
             * via the "Run AI Discovery"/"Resume AI Discovery" button above -- a second
             * button here would trigger the identical action, reading as two controls for
             * one thing rather than one clear entry point (the same call DISC-OFFER-P1-01.1
             * already made for its own schedule widget's own would-be second "Run Now"). */}
          </div>
        </div>
      ) : null}
    </div>
  );
}
