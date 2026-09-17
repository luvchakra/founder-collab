import { HandCoins } from "lucide-react";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { formatDate } from "@cofounderai/core/lib/format";
import { cn } from "@cofounderai/core/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { AGING_BUCKETS, AGING_BUCKET_LABELS, type AgingBucket, type PaymentStatus } from "../../lib/accounting/aging";
import { ledgerAmount } from "./labels";
import type { ReceivablesLedger } from "../../lib/accounting/receivables-queries";

const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  overpaid: "Overpaid",
};

/** Overdue reads as a warning, current as neutral — an invoice that isn't late yet is
 * not a problem, and colouring it as one trains people to ignore the colour. */
function bucketTone(bucket: AgingBucket): string {
  if (bucket === "current") return "text-muted-foreground";
  if (bucket === "1-30") return "text-warning-subtle";
  return "text-destructive-subtle";
}

/**
 * Who owes what, and how late they are.
 *
 * Three readings of the same figures, in the order someone actually uses them: the
 * headline (how much is out there, how much is late), then the aging profile, then the
 * invoices themselves with the oldest at the top — the list of what to chase today.
 */
export function ReceivablesView({ ledger }: { ledger: ReceivablesLedger }) {
  const { items, summary, byParty } = ledger;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        message="Nothing outstanding. Every invoice you've issued has been settled or credited."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total outstanding" value={ledgerAmount.format(summary.totalOutstanding)} detail={`${summary.count} open ${summary.count === 1 ? "invoice" : "invoices"}`} tone="primary" />
        <StatCard label="Overdue" value={ledgerAmount.format(summary.overdue)} detail="Past its due date" tone={summary.overdue > 0 ? "destructive" : "success"} />
        <StatCard label="Not yet due" value={ledgerAmount.format(summary.notYetDue)} tone="success" />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">By customer</h2>
        <div className="rounded-2xl border border-border">
          {/* Mobile: a five-column aging grid is unreadable at phone width, so each
              customer becomes a card with only the buckets that actually hold money. */}
          <ul className="divide-y md:hidden">
            {byParty.map((party) => (
              <li key={party.partyId} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-medium break-words">{party.partyName}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{ledgerAmount.format(party.total)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {AGING_BUCKETS.filter((b) => party.buckets[b] > 0).map((bucket) => (
                    <span key={bucket} className={bucketTone(bucket)}>
                      {AGING_BUCKET_LABELS[bucket]}: {ledgerAmount.format(party.buckets[bucket])}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                {AGING_BUCKETS.map((bucket) => (
                  <TableHead key={bucket} className="text-right">
                    {AGING_BUCKET_LABELS[bucket]}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byParty.map((party) => (
                <TableRow key={party.partyId}>
                  <TableCell className="font-medium">{party.partyName}</TableCell>
                  {AGING_BUCKETS.map((bucket) => (
                    <TableCell key={bucket} className={cn("text-right tabular-nums", bucketTone(bucket))}>
                      {party.buckets[bucket] > 0 ? ledgerAmount.format(party.buckets[bucket]) : "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {ledgerAmount.format(party.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                <TableCell>All customers</TableCell>
                {AGING_BUCKETS.map((bucket) => (
                  <TableCell key={bucket} className="text-right tabular-nums">
                    {summary.buckets[bucket] > 0 ? ledgerAmount.format(summary.buckets[bucket]) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums">
                  {ledgerAmount.format(summary.totalOutstanding)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Open invoices</h2>
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1.5 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{item.number ?? "—"}</p>
                    <p className="text-xs text-muted-foreground break-words">{item.partyName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{ledgerAmount.format(item.outstanding)}</p>
                    <p className={cn("text-xs", bucketTone(item.bucket))}>
                      {AGING_BUCKET_LABELS[item.bucket]}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={item.status} label={STATUS_LABEL[item.status]} />
                  <span>Due {item.dueDate ? formatDate(item.dueDate) : "—"}</span>
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="w-32">Due</TableHead>
                <TableHead className="w-32">Age</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-36 text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium tabular-nums">{item.number ?? "—"}</TableCell>
                  <TableCell>{item.partyName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.dueDate ? formatDate(item.dueDate) : "—"}
                  </TableCell>
                  <TableCell className={bucketTone(item.bucket)}>
                    {AGING_BUCKET_LABELS[item.bucket]}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} label={STATUS_LABEL[item.status]} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {ledgerAmount.format(item.outstanding)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
