import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { DISCOVERY_PLAYS_NOTE, type OfferingPerformanceAnalysis, type RateBucket } from "../../lib/performance-analysis/types";

function RateBucketList({ buckets, emptyMessage }: { buckets: RateBucket[]; emptyMessage: string }) {
  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {buckets.map((b) => (
        <li key={b.label} className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5">
          <span className="truncate">{b.label}</span>
          <span className="shrink-0 text-muted-foreground">
            {b.rate}% <span className="text-xs">({b.matched}/{b.total})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * DISC-OFFER-P1 §7-02.3 "Offering Performance Analysis" -- four of the doc's own five
 * questions, each its own section; the fifth ("which Discovery Plays perform best") is
 * named as not-yet-answerable rather than silently dropped -- see `DISCOVERY_PLAYS_NOTE`
 * (types.ts) for exactly why.
 */
export function OfferingPerformanceAnalysisView({ analysis }: { analysis: OfferingPerformanceAnalysis }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Which signals produce conversations?</h2>
        <RateBucketList buckets={analysis.signalsProducingConversations} emptyMessage="No signals recorded yet." />
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Which ICP attributes produce conversions?</h2>
        <p className="text-xs text-muted-foreground">Won rate by each prospect&apos;s own industry and location.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Industry</p>
            <RateBucketList buckets={analysis.industryConversionRates} emptyMessage="No prospects with an industry on file yet." />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Location</p>
            <RateBucketList buckets={analysis.locationConversionRates} emptyMessage="No prospects with a location on file yet." />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Which buyer roles respond?</h2>
        <p className="text-xs text-muted-foreground">Reply rate by contact job title, among conversations linked to a named contact.</p>
        <RateBucketList buckets={analysis.buyerRolesThatRespond} emptyMessage="No conversations linked to a named contact yet." />
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Does a higher score correlate with better outcomes?</h2>
        <p className="text-xs text-muted-foreground">Won rate by score range.</p>
        <RateBucketList buckets={analysis.scoreVsOutcome} emptyMessage="No scored prospects yet." />
      </section>

      <EmptyState message={DISCOVERY_PLAYS_NOTE} variant="inline" />
    </div>
  );
}
