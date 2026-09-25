import { formatMetric } from "../../lib/marketing/metrics";
import type { FunnelStage } from "../../lib/marketing/metrics";

/** MKT-03/MKT-14 — the marketing funnel: absolute counts plus conversion where both ends
 * were reported (§7). Bars are scaled to the largest reported stage. */
export function MarketingFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(0, ...stages.map((s) => s.count ?? 0));
  return (
    <ol className="flex flex-col gap-2">
      {stages.map((s) => {
        const width = s.count !== null && max > 0 ? Math.max(2, Math.round((s.count / max) * 100)) : 0;
        return (
          <li key={s.key} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{s.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
            </span>
            <span className="flex items-baseline gap-2 tabular-nums">
              <span className="font-medium">{formatMetric(s.count, "count")}</span>
              {s.conversionFromPrevious !== null ? (
                <span className="text-xs text-muted-foreground">{formatMetric(s.conversionFromPrevious, "percent")}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
