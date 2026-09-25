import { formatAmount, type RoundProgress } from "../../lib/funding/metrics";

/**
 * FND-06 — target, committed, raised and remaining, drawn so a commitment never looks like
 * cash received (§20.3): raised is the solid bar, committed the lighter one behind it.
 */
export function RoundProgressBar({ progress }: { progress: RoundProgress }) {
  const pct = (share: number | null) => (share === null ? 0 : Math.min(100, Math.round(share * 100)));
  const c = progress.currency;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${pct(progress.committedShare)}%` }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(progress.raisedShare)}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Target</dt>
          <dd className="font-medium tabular-nums">{formatAmount(progress.target.value, c)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Committed (not yet received)</dt>
          <dd className="font-medium tabular-nums">{formatAmount(progress.committed.value, c)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Raised (received)</dt>
          <dd className="font-medium tabular-nums">{formatAmount(progress.raised.value, c)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Remaining</dt>
          <dd className="font-medium tabular-nums">
            {progress.aboveTarget ? "Above target" : formatAmount(progress.remaining.value, c)}
          </dd>
        </div>
      </dl>
      {progress.excludedForCurrency > 0 ? (
        <p className="text-xs text-muted-foreground">
          {progress.excludedForCurrency} amount{progress.excludedForCurrency === 1 ? " is" : "s are"} in another currency and not included.
        </p>
      ) : null}
    </div>
  );
}
