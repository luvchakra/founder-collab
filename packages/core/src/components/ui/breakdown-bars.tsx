import { cn } from "../../lib/utils";

export type BreakdownItem = { key: string; label: string; value: number };

/** Fixed categorical order (never reassigned per-filter, so a category keeps its color
 * even as a slice-and-dice filter changes which ones are non-zero) -- the platform's
 * own chart-1..5 theme tokens (packages/core/src/ui-theme.css), same ramp the
 * inventory/discovery/fsm dashboards all draw from. */
const BAR_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

/**
 * A handful of named categories compared by count -- direct-labeled horizontal bars
 * rather than a pie (dataviz guidance: identity comparison among few categories reads
 * better as bars with a number attached than as wedge angles). Lives in `core` (not any
 * one module) since it has no domain logic of its own -- every module's dashboard
 * feeds it whatever breakdown it's already computed (status, outcome, industry, job
 * status, ...).
 */
export function BreakdownBars({ items }: { items: BreakdownItem[] }) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No data yet.</p>;
  }

  const max = Math.max(...items.map((i) => i.value));

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={item.key} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 truncate text-muted-foreground" title={item.label}>
            {item.label}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", BAR_COLORS[i % BAR_COLORS.length])}
              style={{ width: max > 0 ? `${(item.value / max) * 100}%` : "0%" }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-medium">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
