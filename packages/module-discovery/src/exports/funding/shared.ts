import type { ExportColumn } from "@cofounderai/core/exports/types";
import type { getFundingFinanceSnapshot } from "@cofounderai/module-gst/contract/index";
import type { FundingAttentionItem } from "../../lib/funding/attention";
import type { Figure, FigureKind, FunnelStep, RoundProgress } from "../../lib/funding/metrics";
import { PIPELINE_STAGE_LABEL, ROUND_STATUS_LABEL, ROUND_TYPE_LABEL, type FundingRound } from "../../lib/funding/types";

/**
 * EXP-FND-01..10 -- what the Funding exports share. The rule they all keep
 * (docs/plan/13-DATA-EXPORT-BACKLOG.md §44, §45, §47): every figure travels with what kind
 * of number it is and where it came from -- user-entered, Finance-derived, AI-inferred,
 * source-backed -- in its own column next to the value, and an amount nobody supplied
 * stays blank, never 0.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id-valued request param -- only ever used together with the business filter, so a
 * foreign id matches nothing; anything that isn't a UUID is ignored. */
export function idParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value && UUID.test(value) ? value : undefined;
}

export const FIGURE_KIND_LABEL: Record<FigureKind, string> = {
  actual: "Actual",
  projected: "Projected",
  user_entered: "User-entered",
  ai_suggested: "AI-suggested",
};

export const SEVERITY_LABEL: Record<FundingAttentionItem["severity"], string> = { high: "High", medium: "Medium", low: "Low" };

// ---------------------------------------------------------------------------
// Finance (read only through module-gst's contract, ADR-10)
// ---------------------------------------------------------------------------

type FinanceResult = Awaited<ReturnType<typeof getFundingFinanceSnapshot>>;
export type FinanceSnapshot = Extract<FinanceResult, { ok: true }>["data"];

/** The snapshot when Finance is licensed and has accounts, else null -- and, either way,
 * the words for a "source" column. An unavailable Finance never becomes a guessed or
 * stale number (§45). */
export function financeSource(result: FinanceResult): { data: FinanceSnapshot | null; source: string } {
  if (!result.ok) {
    return {
      data: null,
      source: result.error === "MODULE_NOT_LICENSED" ? "Finance unavailable: not licensed for this business" : "Finance unavailable",
    };
  }
  if (!result.data.hasAccounts) return { data: null, source: "Finance unavailable: no accounts set up" };
  return { data: result.data, source: `Finance ledger, read ${result.data.asOf}` };
}

// ---------------------------------------------------------------------------
// Figure rows (dashboard Summary and friends)
// ---------------------------------------------------------------------------

export type FigureRow = {
  label: string;
  value: number | null;
  currency: string | null;
  kind: string;
  source: string;
  definition: string;
};

export function figureRow(label: string, figure: Figure, source: string, currency: string | null = null): FigureRow {
  return { label, value: figure.value, currency, kind: FIGURE_KIND_LABEL[figure.kind], source, definition: figure.definition };
}

export const FIGURE_COLUMNS: ExportColumn<FigureRow>[] = [
  { key: "metric", header: "Metric", getValue: (r) => r.label },
  { key: "value", header: "Value", type: "number", getValue: (r) => r.value },
  { key: "currency", header: "Currency", getValue: (r) => r.currency },
  { key: "kind", header: "Kind of figure", getValue: (r) => r.kind },
  { key: "source", header: "Source", getValue: (r) => r.source },
  { key: "definition", header: "How calculated", getValue: (r) => r.definition },
];

/** Finance figures as figure rows: the value with its source, or blank with the reason. */
export function financeFigures(result: FinanceResult): FigureRow[] {
  const { data, source } = financeSource(result);
  const kind = "Finance-derived";
  const row = (label: string, value: number | null | undefined, definition: string): FigureRow => ({
    label,
    value: data ? (value ?? null) : null,
    currency: data?.currency ?? null,
    kind,
    source,
    definition,
  });
  return [
    row("Cash", data?.cash, "Cash and bank balances in the ledger."),
    row("Revenue, last 3 months", data?.revenueLast3Months, "Revenue over the three complete months before the read."),
    row("Monthly burn", data?.netBurn, "Average monthly loss over the last three complete months; blank when the business is not losing money."),
    row("Receivables", data?.receivable, "Amounts owed to the business."),
    {
      ...row("Runway (months)", data?.runwayMonths, "Cash ÷ average monthly loss; blank when the business is not losing money."),
      currency: null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Rounds, funnel, attention
// ---------------------------------------------------------------------------

export type RoundRow = { round: FundingRound; progress: RoundProgress };

export function roundColumns(now: Date = new Date()): ExportColumn<RoundRow>[] {
  return [
    { key: "round", header: "Round", getValue: (r) => r.round.name },
    { key: "type", header: "Type", getValue: (r) => ROUND_TYPE_LABEL[r.round.roundType] ?? r.round.roundType },
    { key: "status", header: "Status", getValue: (r) => ROUND_STATUS_LABEL[r.round.status] ?? r.round.status },
    { key: "primary", header: "Primary round", type: "boolean", getValue: (r) => r.round.isPrimary },
    { key: "target", header: "Target", type: "currency", getValue: (r) => r.progress.target.value },
    { key: "committed", header: "Committed", type: "currency", getValue: (r) => r.progress.committed.value },
    { key: "raised", header: "Raised", type: "currency", getValue: (r) => r.progress.raised.value },
    { key: "remaining", header: "Remaining", type: "currency", getValue: (r) => r.progress.remaining.value },
    { key: "aboveTarget", header: "Above target", type: "boolean", getValue: (r) => r.progress.aboveTarget },
    { key: "currency", header: "Currency", getValue: (r) => r.round.currency },
    { key: "committedShare", header: "Committed share of target", type: "percent", getValue: (r) => r.progress.committedShare },
    { key: "raisedShare", header: "Raised share of target", type: "percent", getValue: (r) => r.progress.raisedShare },
    { key: "excluded", header: "Pipeline records in another currency (left out)", type: "integer", getValue: (r) => r.progress.excludedForCurrency },
    { key: "instrument", header: "Instrument", getValue: (r) => r.round.instrument },
    { key: "min", header: "Minimum", type: "currency", getValue: (r) => r.round.minimumAmount },
    { key: "max", header: "Maximum", type: "currency", getValue: (r) => r.round.maximumAmount },
    { key: "preMoney", header: "Pre-money valuation", type: "currency", getValue: (r) => r.round.preMoneyValuation },
    { key: "postMoney", header: "Post-money valuation", type: "currency", getValue: (r) => r.round.postMoneyValuation },
    { key: "targetClose", header: "Target close", type: "date", getValue: (r) => r.round.targetCloseDate },
    { key: "actualClose", header: "Actual close", type: "date", getValue: (r) => r.round.actualCloseDate },
    { key: "opened", header: "Opened", type: "datetime", getValue: (r) => r.round.openedAt },
    {
      key: "days",
      header: "Days in round",
      type: "integer",
      getValue: (r) => (r.round.openedAt ? Math.max(0, Math.floor((now.getTime() - new Date(r.round.openedAt).getTime()) / 86_400_000)) : null),
    },
    { key: "useOfFunds", header: "Use of funds", getValue: (r) => r.round.useOfFunds },
    {
      key: "provenance",
      header: "Amounts provenance",
      getValue: () => "Target: user-entered; committed: user-entered commitments; raised: amounts recorded as received",
    },
  ];
}

export type FunnelRow = { stage: string; reached: number | null; current: number; conversion: number | null; medianDays?: number | null };

export function funnelRows(funnel: { steps: FunnelStep[]; passed: number }, medianDays?: Partial<Record<string, number>>): FunnelRow[] {
  return [
    ...funnel.steps.map((s) => ({
      stage: PIPELINE_STAGE_LABEL[s.stage] ?? s.stage,
      reached: s.reached,
      current: s.current,
      conversion: s.conversionFromPrevious,
      medianDays: medianDays ? (medianDays[s.stage] ?? null) : undefined,
    })),
    { stage: PIPELINE_STAGE_LABEL.passed, reached: null, current: funnel.passed, conversion: null, medianDays: medianDays ? null : undefined },
  ];
}

export function funnelColumns(withMedianDays = false): ExportColumn<FunnelRow>[] {
  return [
    { key: "stage", header: "Stage", getValue: (r) => r.stage },
    { key: "reached", header: "Reached (from stage history)", type: "integer", getValue: (r) => r.reached },
    { key: "current", header: "Currently at stage", type: "integer", getValue: (r) => r.current },
    { key: "conversion", header: "Conversion from previous stage", type: "percent", getValue: (r) => r.conversion },
    ...(withMedianDays ? [{ key: "median", header: "Median days in stage", type: "number" as const, getValue: (r: FunnelRow) => r.medianDays ?? null }] : []),
  ];
}

export const ATTENTION_COLUMNS: ExportColumn<FundingAttentionItem>[] = [
  { key: "severity", header: "Severity", getValue: (a) => SEVERITY_LABEL[a.severity] },
  { key: "title", header: "Item", getValue: (a) => a.title },
  { key: "reason", header: "Reason", getValue: (a) => a.reason },
  { key: "data", header: "Underlying data", getValue: (a) => a.data },
  { key: "action", header: "Suggested action", getValue: (a) => a.action },
  { key: "source", header: "Source", getValue: (a) => a.source },
  { key: "origin", header: "How it was produced", getValue: (a) => (a.origin === "ai" ? "AI-inferred" : "Rule-based") },
];

/** A two-column "what / how many" sheet. */
export type CountRow = { label: string; value: number | null };
export const COUNT_COLUMNS: ExportColumn<CountRow>[] = [
  { key: "label", header: "Measure", getValue: (r) => r.label },
  { key: "value", header: "Value", type: "number", getValue: (r) => r.value },
];
