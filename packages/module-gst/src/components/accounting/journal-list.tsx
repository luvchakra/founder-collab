import Link from "next/link";
import { BookText } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { formatDate } from "@cofounderai/core/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { JOURNAL_STATUS_LABEL, describeEntrySource } from "../../lib/accounting/journal";
import { ledgerAmount } from "./labels";
import type { JournalEntryRow } from "../../lib/accounting/journal-queries";

/**
 * The journal: every entry in the ledger, newest first.
 *
 * Reading, not editing — each row is a link into the entry itself, where the lines and
 * the reason it exists live. The memo carries most of the meaning (it is the posting
 * rule's own explanation for an automatic entry), so it gets the width, and the amount
 * sits right-aligned where a number belongs. Below `md` each entry becomes a card
 * (CLAUDE.md rule 12).
 */
export function JournalList({
  entries,
  basePath,
}: {
  entries: JournalEntryRow[];
  /** Route the entry links hang off, e.g. `/acme/finance/journal`. */
  basePath: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={BookText}
        message="No journal entries yet. Invoices, bills and payments post here automatically, and you can add an adjustment by hand."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-border">
      <ul className="divide-y md:hidden">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link href={`${basePath}/${entry.id}`} className="flex flex-col gap-2 p-3 text-sm hover:bg-accent/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{entry.entry_number ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(entry.posting_date)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="font-semibold tabular-nums">{ledgerAmount.format(entry.amount)}</p>
                  <StatusBadge status={entry.status} label={JOURNAL_STATUS_LABEL[entry.status]} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{entry.memo ?? describeEntrySource(entry)}</p>
              {entry.status === "draft" && !entry.balanced ? (
                <Badge variant="warning" className="self-start">
                  Doesn&apos;t balance yet
                </Badge>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Entry</TableHead>
            <TableHead className="w-32">Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-28">Source</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-40 text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium tabular-nums">
                <Link href={`${basePath}/${entry.id}`} className="hover:underline">
                  {entry.entry_number ?? "View"}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(entry.posting_date)}</TableCell>
              <TableCell>
                <span className="line-clamp-2">{entry.memo ?? describeEntrySource(entry)}</span>
                {entry.status === "draft" && !entry.balanced ? (
                  <Badge variant="warning" className="mt-1">
                    Doesn&apos;t balance yet
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-muted-foreground capitalize">
                {entry.source_module === "finance" || !entry.source_module ? "By hand" : entry.source_module}
              </TableCell>
              <TableCell>
                <StatusBadge status={entry.status} label={JOURNAL_STATUS_LABEL[entry.status]} />
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {ledgerAmount.format(entry.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
