import { formatMetric, type Metric } from "../../lib/marketing/metrics";

/**
 * A KPI tile that always carries its own definition (§7: "every KPI must have a source and
 * calculation definition"; §73: a "How calculated" affordance). Unavailable values render
 * as "—" with the reason in the definition, never as 0.
 */
export function MetricTile({
  label,
  metric,
  kind = "count",
  currency,
}: {
  label: string;
  metric: Metric;
  kind?: "count" | "percent" | "money";
  currency?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-xs">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{formatMetric(metric.value, kind, currency)}</p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground">How calculated</summary>
        <p className="mt-1">{metric.definition}</p>
        {metric.value === null ? <p className="mt-1">Not enough reported data to show a value.</p> : null}
      </details>
    </div>
  );
}
