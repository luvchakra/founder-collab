import { PIPELINE_ORDER } from "./lifecycle";
import type { DataRoomItem, DataRoomShare, PipelineRecord, PipelineStage, ReadinessItem, ReadinessStatus, StageChange } from "./types";

/**
 * FND-03/FND-14 — Funding arithmetic. Same rule as Marketing: a figure nobody supplied is
 * null (rendered "—"), never 0; every figure says how it was computed and what kind of
 * number it is (§20.2: Actual / Projected / User-entered / AI-suggested).
 */

export type FigureKind = "actual" | "projected" | "user_entered" | "ai_suggested";

export interface Figure {
  value: number | null;
  kind: FigureKind;
  definition: string;
}

export interface RoundProgress {
  currency: string | null;
  target: Figure;
  committed: Figure;
  raised: Figure;
  remaining: Figure;
  /** True when raised exceeds target — shown as "Above target", never as a negative. */
  aboveTarget: boolean;
  committedShare: number | null;
  raisedShare: number | null;
  /** Pipeline records whose amounts are in another currency and so are left out. */
  excludedForCurrency: number;
}

function sum(values: (number | null)[]): number | null {
  const reported = values.filter((v): v is number => v !== null);
  if (reported.length === 0) return null;
  return Math.round(reported.reduce((a, b) => a + b, 0) * 100) / 100;
}

/**
 * Target, committed, raised and remaining for a round (§20.3, §73). Committed counts
 * records at Committed or Invested (an investment was a commitment first); Raised counts
 * only the invested amounts. Amounts in a different currency from the round are left
 * out and counted, never converted.
 */
export function roundProgress(
  round: { targetAmount: number | null; currency: string | null },
  pipeline: Pick<PipelineRecord, "stage" | "committedAmount" | "investedAmount" | "currency">[],
): RoundProgress {
  const currency = round.currency;
  const same = pipeline.filter((p) => !p.currency || !currency || p.currency === currency);
  const excluded = pipeline.length - same.length;
  const committed = sum(
    same.filter((p) => p.stage === "committed" || p.stage === "invested").map((p) => p.committedAmount ?? p.investedAmount),
  );
  const raised = sum(same.filter((p) => p.stage === "invested").map((p) => p.investedAmount));
  const target = round.targetAmount;
  const remainingRaw = target !== null ? target - (raised ?? 0) : null;
  return {
    currency,
    target: { value: target, kind: "user_entered", definition: "The round's target, as entered." },
    committed: {
      value: committed,
      kind: "user_entered",
      definition: "Sum of committed amounts recorded for investors at Committed or Invested. A commitment is not money received.",
    },
    raised: { value: raised, kind: "actual", definition: "Sum of amounts recorded as received from investors at Invested." },
    remaining: {
      value: remainingRaw === null ? null : Math.max(remainingRaw, 0),
      kind: "actual",
      definition: "Target minus raised. Shown as zero with an 'Above target' label once raised exceeds the target.",
    },
    aboveTarget: remainingRaw !== null && remainingRaw < 0,
    committedShare: target && committed !== null ? committed / target : null,
    raisedShare: target && raised !== null ? raised / target : null,
    excludedForCurrency: excluded,
  };
}

export interface FunnelStep {
  stage: PipelineStage;
  /** Records currently at this stage. */
  current: number;
  /** Records that have ever reached this stage or beyond (from stage history). */
  reached: number;
  conversionFromPrevious: number | null;
}

/**
 * The investor funnel (§20.4, §31.1). "Reached" comes from stage history, so an investor
 * who met and then passed still counts as having reached Meeting — conversion computed
 * from current stages alone would undercount every step.
 */
export function investorFunnel(pipeline: Pick<PipelineRecord, "id" | "stage">[], history: StageChange[]): {
  steps: FunnelStep[];
  passed: number;
} {
  const furthest = new Map<string, number>();
  const note = (id: string, stage: PipelineStage | null) => {
    if (!stage || stage === "passed") return;
    const i = PIPELINE_ORDER.indexOf(stage);
    if (i > (furthest.get(id) ?? -1)) furthest.set(id, i);
  };
  for (const p of pipeline) note(p.id, p.stage);
  for (const h of history) {
    note(h.pipelineId, h.fromStage);
    note(h.pipelineId, h.toStage);
  }
  const ids = new Set(pipeline.map((p) => p.id));
  let previous: number | null = null;
  const steps = PIPELINE_ORDER.map((stage, i) => {
    const reached = [...furthest.entries()].filter(([id, f]) => ids.has(id) && f >= i).length;
    const step: FunnelStep = {
      stage,
      current: pipeline.filter((p) => p.stage === stage).length,
      reached,
      conversionFromPrevious: previous && previous > 0 ? reached / previous : null,
    };
    previous = reached;
    return step;
  });
  return { steps, passed: pipeline.filter((p) => p.stage === "passed").length };
}

/** Median days spent in each stage, from completed stays in stage history (§31.2). */
export function timeInStage(history: StageChange[]): Partial<Record<PipelineStage, number>> {
  const byPipeline = new Map<string, StageChange[]>();
  for (const h of history) {
    const list = byPipeline.get(h.pipelineId) ?? [];
    list.push(h);
    byPipeline.set(h.pipelineId, list);
  }
  const stays = new Map<PipelineStage, number[]>();
  for (const list of byPipeline.values()) {
    list.sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    for (let i = 0; i < list.length - 1; i += 1) {
      const stage = list[i]!.toStage;
      const days = (new Date(list[i + 1]!.changedAt).getTime() - new Date(list[i]!.changedAt).getTime()) / 86_400_000;
      const arr = stays.get(stage) ?? [];
      arr.push(days);
      stays.set(stage, arr);
    }
  }
  const out: Partial<Record<PipelineStage, number>> = {};
  for (const [stage, days] of stays) {
    const sorted = [...days].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    out[stage] = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return out;
}

export function readinessSummary(items: Pick<ReadinessItem, "status" | "dueAt">[], today: string) {
  const count = (s: ReadinessStatus) => items.filter((i) => i.status === s).length;
  const applicable = items.filter((i) => i.status !== "not_applicable").length;
  return {
    ready: count("ready"),
    needsAttention: count("needs_attention"),
    missing: count("missing"),
    notApplicable: count("not_applicable"),
    overdue: items.filter((i) => i.status !== "ready" && i.status !== "not_applicable" && i.dueAt !== null && i.dueAt < today).length,
    /** Share of applicable items marked Ready by a person; null with nothing to measure. */
    completion: applicable > 0 ? count("ready") / applicable : null,
  };
}

export function dataRoomSummary(items: Pick<DataRoomItem, "status" | "isCurrent">[], shares: Pick<DataRoomShare, "revokedAt" | "expiresAt" | "accessCount">[], now: Date) {
  const current = items.filter((i) => i.isCurrent);
  return {
    ready: current.filter((i) => i.status === "ready" || i.status === "shared").length,
    missing: current.filter((i) => i.status === "missing").length,
    draft: current.filter((i) => i.status === "draft").length,
    expired: current.filter((i) => i.status === "expired").length,
    activeShares: shares.filter((s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now.getTime()).length,
    accessEvents: shares.reduce((n, s) => n + s.accessCount, 0),
  };
}

/** Research older than this is labelled stale rather than presented as current (§26.2). */
export const RESEARCH_FRESHNESS_DAYS = 90;

export function researchState(
  investor: { researchStatus: "not_researched" | "researching" | "researched"; lastResearchedAt: string | null },
  now: Date,
  freshnessDays = RESEARCH_FRESHNESS_DAYS,
): "not_researched" | "researching" | "researched" | "stale" {
  if (investor.researchStatus !== "researched" || !investor.lastResearchedAt) return investor.researchStatus;
  const ageDays = (now.getTime() - new Date(investor.lastResearchedAt).getTime()) / 86_400_000;
  return ageDays > freshnessDays ? "stale" : "researched";
}

export function formatAmount(value: number | null, currency: string | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency ?? ""} ${Math.round(value).toLocaleString("en-IN")}`.trim();
  }
}
