import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { CorrelationConfidence, Signal, SignalCorrelation } from "../../lib/signals/types";
import { SIGNAL_TYPE_LABEL } from "../../lib/signals/types";

/** DISC-OFFER-P1-05.2: the doc's own "Signals" table column set (Signal | Source | Date |
 * Relevance | Confidence | Action). "Signal, Source, Date" are real columns on the raw
 * `Signal` row itself; "Relevance"/"Confidence" are not -- a single signal has neither
 * field of its own, only the *correlated read* over a set of signals does
 * (`SignalCorrelation.rationale`/`.confidence`, DISC-OFFER-P0-05.3). Rather than inventing
 * a per-signal relevance/confidence that doesn't exist, this shows the correlation's own
 * values on exactly the signals that correlation actually covers (`signal_ids`) -- a real
 * fact about that signal ("this is one of the signals the current correlation is based
 * on"), and "—" for any signal outside it (no false precision for one this run's own
 * correlation didn't consider). "Action" is deliberately omitted -- unlike an opportunity
 * or a buyer, a raw signal has no real per-row action anywhere in this module today (it's
 * an immutable fact, not an editable/actionable record); inventing one here would be
 * exactly the speculative functionality CLAUDE.md dev principle #7 forbids. */

const CONFIDENCE_BADGE_VARIANT: Record<CorrelationConfidence, "default" | "secondary" | "outline"> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

function correlatedFieldsFor(signal: Signal, correlation: SignalCorrelation | null): { relevance: string | null; confidence: CorrelationConfidence | null } {
  if (!correlation || !correlation.signal_ids.includes(signal.id)) return { relevance: null, confidence: null };
  return { relevance: correlation.rationale, confidence: correlation.confidence };
}

export function SignalTable({ signals, correlation }: { signals: Signal[]; correlation: SignalCorrelation | null }) {
  if (signals.length === 0) {
    return <p className="text-sm text-muted-foreground">No signals recorded yet.</p>;
  }

  return (
    <div className="rounded-lg border border-border">
      {/* Mobile: one card per row (CLAUDE.md #12) */}
      <ul className="divide-y md:hidden">
        {signals.map((signal) => {
          const { relevance, confidence } = correlatedFieldsFor(signal, correlation);
          return (
            <li key={signal.id} className="flex flex-col gap-1.5 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1">{signal.description}</span>
                {confidence ? <Badge variant={CONFIDENCE_BADGE_VARIANT[confidence]}>{confidence}</Badge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-1 py-0.5">{SIGNAL_TYPE_LABEL[signal.signal_type]}</span>
                <span>{signal.source ?? "No source on file"}</span>
                <span>{formatDateTime(signal.observed_at)}</span>
              </div>
              {relevance ? <p className="text-xs text-muted-foreground">{relevance}</p> : null}
            </li>
          );
        })}
      </ul>

      {/* Desktop: proto-table */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Signal</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Relevance</TableHead>
            <TableHead>Confidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signals.map((signal) => {
            const { relevance, confidence } = correlatedFieldsFor(signal, correlation);
            return (
              <TableRow key={signal.id}>
                <TableCell className="max-w-72">
                  <span className="mr-1.5 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">{SIGNAL_TYPE_LABEL[signal.signal_type]}</span>
                  {signal.description}
                </TableCell>
                <TableCell className="text-muted-foreground">{signal.source ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(signal.observed_at)}</TableCell>
                <TableCell className="max-w-56 text-muted-foreground">{relevance ?? "—"}</TableCell>
                <TableCell>{confidence ? <Badge variant={CONFIDENCE_BADGE_VARIANT[confidence]}>{confidence}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
