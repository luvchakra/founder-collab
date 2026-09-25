import { PIPELINE_STAGE_LABEL } from "../../lib/funding/types";
import type { FunnelStep } from "../../lib/funding/metrics";

/** FND-09/FND-14 — the investor funnel (§20.4): how many reached each stage, how many
 * sit there now, and the step conversion. Passed is shown on its own line. */
export function InvestorFunnel({ steps, passed }: { steps: FunnelStep[]; passed: number }) {
  const max = Math.max(0, ...steps.map((s) => s.reached));
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <li key={s.stage} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{PIPELINE_STAGE_LABEL[s.stage]}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary" style={{ width: max > 0 ? `${Math.round((s.reached / max) * 100)}%` : "0%" }} />
            </span>
            <span className="flex items-baseline gap-2 tabular-nums">
              <span className="font-medium">{s.reached}</span>
              <span className="text-xs text-muted-foreground">
                {s.current} now{s.conversionFromPrevious !== null ? ` · ${(s.conversionFromPrevious * 100).toFixed(0)}%` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Passed: {passed}</p>
    </div>
  );
}
