import Link from "next/link";
import { Info } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
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
import { JOURNAL_STATUS_LABEL } from "../../lib/accounting/journal";
import {
  POSTING_KIND_LABEL,
  type DocumentLedgerStatus,
  type NetEffectRow,
} from "../../lib/accounting/document-postings";
import type { DocumentLedger } from "../../lib/accounting/document-posting-queries";
import { ledgerAmount } from "./labels";

const LEDGER_STATUS: Record<DocumentLedgerStatus, { status: string; label: string }> = {
  not_posted: { status: "pending", label: "Not in the ledger" },
  posted: { status: "success", label: "Posted" },
  reversed: { status: "void", label: "Reversed" },
};

/**
 * FIN-12: a source document and the entries it caused, read top to bottom as the story of
 * what it did to the books — its own posting, what settled it, any reversal — followed by
 * the net effect on each account once all of them are added up.
 *
 * Each entry links to its own page, where the forward explanation (rule, version, source)
 * already lives; this page is the index into those from the document's side.
 */
export function DocumentLedgerView({
  ledger,
  journalPath,
  accountPath,
}: {
  ledger: DocumentLedger;
  journalPath: string;
  /** Where an account name links to (its drill-down). */
  accountPath: (accountId: string) => string;
}) {
  const { document, summary } = ledger;
  const status = LEDGER_STATUS[summary.status];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-8 gap-y-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Date</dt>
          <dd className="font-medium">{formatDate(document.doc_date)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{document.doc_type.startsWith("supplier") ? "Supplier" : "Customer"}</dt>
          <dd className="font-medium break-words">{document.partyName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="font-medium tabular-nums">{ledgerAmount.format(Number(document.total_amount ?? 0))}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">In the ledger</dt>
          <dd>
            <StatusBadge status={status.status} label={status.label} />
          </dd>
        </div>
      </dl>

      {ledger.unpostedReason ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{ledger.unpostedReason}</span>
        </p>
      ) : null}

      {summary.entries.length > 0 ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Entries this caused</h2>
            <ol className="flex flex-col gap-3">
              {summary.entries.map(({ entry, kind, why }) => (
                <li key={entry.id} className="rounded-2xl border border-border">
                  <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <Link href={`${journalPath}/${entry.id}`} className="text-primary hover:underline">
                          {entry.entry_number ?? "Entry"}
                        </Link>
                        <Badge variant="outline">{POSTING_KIND_LABEL[kind]}</Badge>
                        <StatusBadge status={entry.status} label={JOURNAL_STATUS_LABEL[entry.status]} />
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.memo ?? why}</p>
                      {entry.memo ? <p className="text-xs text-muted-foreground">{why}</p> : null}
                    </div>
                    <p className="shrink-0 text-sm text-muted-foreground">{formatDate(entry.posting_date)}</p>
                  </div>
                  <ul className="divide-y">
                    {entry.lines.map((line) => (
                      <li key={line.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                        <Link href={accountPath(line.account_id)} className="min-w-0 hover:underline">
                          <span className="text-muted-foreground tabular-nums">{line.account_number}</span>{" "}
                          {line.account_name}
                        </Link>
                        <span className="shrink-0 tabular-nums">
                          {ledgerAmount.format(line.debit > 0 ? line.debit : line.credit)}{" "}
                          <span className="text-xs text-muted-foreground">{line.debit > 0 ? "Dr" : "Cr"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <NetEffect rows={summary.netEffect} accountPath={accountPath} />
        </>
      ) : null}
    </div>
  );
}

/** Every entry above, added up per account — what the document did to the books, net. A
 * fully settled invoice nets receivables to nothing; a reversed one nets everything to
 * nothing, and says so rather than showing an empty table. */
function NetEffect({ rows, accountPath }: { rows: NetEffectRow[]; accountPath: (accountId: string) => string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Net effect on your accounts</h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
          Everything this document posted has since been offset — its net effect on the ledger is nil.
        </p>
      ) : (
        <div className="rounded-2xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="w-32 text-right sm:w-40">Debit</TableHead>
                <TableHead className="w-32 text-right sm:w-40">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.accountId}>
                  <TableCell>
                    <Link href={accountPath(row.accountId)} className="hover:underline">
                      <span className="text-muted-foreground tabular-nums">{row.accountNumber}</span> {row.accountName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.debit > 0 ? ledgerAmount.format(row.debit) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.credit > 0 ? ledgerAmount.format(row.credit) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
