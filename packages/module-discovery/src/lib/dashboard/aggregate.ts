import type { BreakdownItem } from "@cofounderai/core/ui/breakdown-bars";
import type { Prospect } from "../prospects/types";

export type { BreakdownItem };

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendPoint = { date: string; label: string; count: number };

/**
 * Daily new-prospect counts for the last `days` days (default 30), oldest first --
 * pure aggregation over a prospect list already fetched account-wide
 * (getAccountUsageAndProspects), no extra query. Every day in the window is present
 * even at zero, so the chart's x-axis is a continuous timeline rather than skipping
 * quiet days.
 */
export function buildProspectTrend(prospects: Prospect[], days = 30): TrendPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (const p of prospects) {
    const day = new Date(p.created_at);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY_MS);
    const key = day.toISOString().slice(0, 10);
    points.push({
      date: key,
      label: day.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      count: counts.get(key) ?? 0,
    });
  }
  return points;
}

/** Generic "count by key, in a fixed display order" reducer -- shared by the status,
 * outcome, and industry breakdowns below so each is a one-line call rather than its
 * own hand-rolled loop. */
function countBy<T>(items: T[], keyOf: (item: T) => string, order: { key: string; label: string }[]): BreakdownItem[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.map(({ key, label }) => ({ key, label, value: counts.get(key) ?? 0 }));
}

export function buildStatusBreakdown(prospects: Prospect[]): BreakdownItem[] {
  return countBy(prospects, (p) => p.status, [
    { key: "new", label: "New" },
    { key: "qualified", label: "Qualified" },
    { key: "disqualified", label: "Disqualified" },
  ]);
}

export function buildOutcomeBreakdown(prospects: Prospect[]): BreakdownItem[] {
  return countBy(prospects, (p) => p.outcome, [
    { key: "open", label: "Open" },
    { key: "won", label: "Won" },
    { key: "lost", label: "Lost" },
  ]);
}

/** Top N industries by prospect count -- the rest fold into "Other" rather than a long
 * tail of one-off bars (dataviz guidance: a categorical axis with too many values never
 * gets a color/bar each, it folds). Prospects with no industry set are excluded
 * entirely, not counted as their own category. */
export function buildIndustryBreakdown(prospects: Prospect[], topN = 6): BreakdownItem[] {
  const counts = new Map<string, number>();
  for (const p of prospects) {
    if (!p.industry) continue;
    counts.set(p.industry, (counts.get(p.industry) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, topN).map(([key, value]) => ({ key, label: key, value }));
  const rest = sorted.slice(topN).reduce((sum, [, value]) => sum + value, 0);
  return rest > 0 ? [...top, { key: "other", label: "Other", value: rest }] : top;
}

/** Won / (won + lost) -- prospects still `open` don't count either way yet. Null (not
 * 0) when there's no closed deal at all, so the caller can show "--" instead of a
 * misleading 0%. */
export function computeWinRate(prospects: Prospect[]): number | null {
  const won = prospects.filter((p) => p.outcome === "won").length;
  const lost = prospects.filter((p) => p.outcome === "lost").length;
  const closed = won + lost;
  return closed === 0 ? null : Math.round((won / closed) * 100);
}

export function computeAvgFitScore(prospects: Prospect[]): number | null {
  const scored = prospects.filter((p) => p.fit_score !== null);
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((sum, p) => sum + (p.fit_score ?? 0), 0) / scored.length);
}
