import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { formatDate, formatDateTime } from "@cofounderai/core/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import {
  JOURNAL_STATUS_LABEL,
  describeEntrySource,
  isReversible,
} from "../../lib/accounting/journal";
import { ledgerAmount } from "./labels";
import type { JournalEntryDetail } from "../../lib/accounting/journal-queries";

/**
 * One entry, its lines, and why it exists.
 *
 * The "why" is not decoration: most entries here are posted automatically, and an
 * accountant looking at one months later needs to know which rule produced it and from
 * what, without reading code. The totals row is the entry's own proof that it balances.
 */
export function JournalEntryDetailView({
  entry,
  accountsPath,
  sourceDocumentHref,
  canPost,
  postAction,
  reverseAction,
}: {
  entry: JournalEntryDetail;
  /** Where an account name links to: that account's drill-down (FIN-7). */
  accountsPath: string;
  /** FIN-12: the source document's own page, listing every entry it caused. */
  sourceDocumentHref?: string | null;
  canPost: boolean;
  postAction: () => Promise<void>;
  reverseAction: () => Promise<void>;
}) {
  const totalDebit = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = entry.lines.reduce((sum, l) => sum + l.credit, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Posted on</dt>
            <dd className="font-medium">{formatDate(entry.posting_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge status={entry.status} label={JOURNAL_STATUS_LABEL[entry.status]} />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Why this entry exists</dt>
            <dd>{describeEntrySource(entry)}</dd>
          </div>
          {entry.posting_rule_key ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Rule</dt>
              <dd className="font-mono text-xs">
                {entry.posting_rule_key}
                {entry.posting_rule_version ? ` v${entry.posting_rule_version}` : ""}
              </dd>
            </div>
          ) : null}
          {sourceDocumentHref ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Source document</dt>
              <dd>
                <Link href={sourceDocumentHref} className="text-primary hover:underline">
                  See every entry this document caused
                </Link>
              </dd>
            </div>
          ) : null}
          {entry.reversal_of_entry_id ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Reverses</dt>
              <dd>
                <Link href={`./${entry.reversal_of_entry_id}`} className="text-primary hover:underline">
                  the entry it was raised against
                </Link>
              </dd>
            </div>
          ) : null}
          {entry.posted_at ? (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Recorded</dt>
              <dd className="text-muted-foreground">{formatDateTime(entry.posted_at)}</dd>
            </div>
          ) : null}
        </dl>

        {canPost ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {entry.status === "draft" ? (
              <form action={postAction}>
                <SubmitButton size="sm" pendingText="Posting..." disabled={!entry.balanced}>
                  Post entry
                </SubmitButton>
              </form>
            ) : null}
            {isReversible(entry.status) ? (
              <form action={reverseAction}>
                <SubmitButton size="sm" variant="outline" pendingText="Reversing...">
                  Reverse
                </SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      {entry.status === "draft" && !entry.balanced ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-subtle">
          Debits and credits don&apos;t match yet, so this can&apos;t be posted. Every entry has to
          balance before it enters the ledger.
        </p>
      ) : null}

      <div className="rounded-2xl border border-border">
        <ul className="divide-y md:hidden">
          {entry.lines.map((line) => (
            <li key={line.id} className="flex flex-col gap-1 p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    <span className="text-muted-foreground tabular-nums">{line.account_number}</span>{" "}
                    {line.account_name}
                  </p>
                  {line.memo ? <p className="text-xs text-muted-foreground">{line.memo}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">
                    {ledgerAmount.format(line.debit > 0 ? line.debit : line.credit)}
                  </p>
                  <p className="text-xs text-muted-foreground">{line.debit > 0 ? "Debit" : "Credit"}</p>
                </div>
              </div>
              {line.tax_code ? <Badge variant="outline" className="self-start">{line.tax_code}</Badge> : null}
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 bg-muted/40 p-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{ledgerAmount.format(totalDebit)}</span>
          </li>
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Line</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="w-36 text-right">Debit</TableHead>
              <TableHead className="w-36 text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="text-muted-foreground tabular-nums">{line.line_number}</TableCell>
                <TableCell>
                  <Link href={`${accountsPath}/${line.account_id}`} className="hover:underline">
                    <span className="text-muted-foreground tabular-nums">{line.account_number}</span>{" "}
                    {line.account_name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {line.memo ?? "—"}
                  {line.tax_code ? (
                    <Badge variant="outline" className="ml-2">
                      {line.tax_code}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.debit > 0 ? ledgerAmount.format(line.debit) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.credit > 0 ? ledgerAmount.format(line.credit) : "—"}
                </TableCell>
              </TableRow>
            ))}
            {/* An entry's own proof that it balances, where an accountant looks for it. */}
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{ledgerAmount.format(totalDebit)}</TableCell>
              <TableCell className="text-right tabular-nums">{ledgerAmount.format(totalCredit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
