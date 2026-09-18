import { Wallet } from "lucide-react";
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
import type { PayablesLedger } from "../../lib/accounting/payables-queries";

const STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  overpaid: "Overpaid",
};

function bucketTone(bucket: AgingBucket): string {
  if (bucket === "current") return "text-muted-foreground";
  if (bucket === "1-30") return "text-warning-subtle";
  return "text-destructive-subtle";
}

/**
 * What this business owes, and what to pay next.
 *
 * The mirror of Receivables, read the other way round: soonest due at the top, because
 * this is a list of what to pay before it costs a relationship or a late fee — not a list
 * of the oldest thing to chase.
 */
export function PayablesView({ ledger }: { ledger: PayablesLedger }) {
  const { items, summary, bySupplier } = ledger;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        message="Nothing outstanding. Every supplier bill you've recorded has been paid or credited."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total owed"
          value={ledgerAmount.format(summary.totalOutstanding)}
          detail={`${summary.count} open bill${summary.count === 1 ? "" : "s"}`}
          tone="primary"
        />
        <StatCard
          label="Overdue"
          value={ledgerAmount.format(summary.overdue)}
          detail="Past its due date"
          tone={summary.overdue > 0 ? "destructive" : "success"}
        />
        <StatCard label="Not yet due" value={ledgerAmount.format(summary.notYetDue)} tone="success" />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">By supplier</h2>
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {bySupplier.map((supplier) => (
              <li key={supplier.partyId} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-medium break-words">{supplier.partyName}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{ledgerAmount.format(supplier.total)}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {AGING_BUCKETS.filter((b) => supplier.buckets[b] > 0).map((bucket) => (
                    <span key={bucket} className={bucketTone(bucket)}>
                      {AGING_BUCKET_LABELS[bucket]}: {ledgerAmount.format(supplier.buckets[bucket])}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                {AGING_BUCKETS.map((bucket) => (
                  <TableHead key={bucket} className="text-right">
                    {AGING_BUCKET_LABELS[bucket]}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySupplier.map((supplier) => (
                <TableRow key={supplier.partyId}>
                  <TableCell className="font-medium">{supplier.partyName}</TableCell>
                  {AGING_BUCKETS.map((bucket) => (
                    <TableCell key={bucket} className={cn("text-right tabular-nums", bucketTone(bucket))}>
                      {supplier.buckets[bucket] > 0 ? ledgerAmount.format(supplier.buckets[bucket]) : "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">
                    {ledgerAmount.format(supplier.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                <TableCell>All suppliers</TableCell>
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
        <h2 className="text-sm font-semibold text-muted-foreground">What to pay next</h2>
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
                    <p className={cn("text-xs", bucketTone(item.bucket))}>{AGING_BUCKET_LABELS[item.bucket]}</p>
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
                <TableHead className="w-32">Bill</TableHead>
                <TableHead>Supplier</TableHead>
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
                  <TableCell className={bucketTone(item.bucket)}>{AGING_BUCKET_LABELS[item.bucket]}</TableCell>
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
