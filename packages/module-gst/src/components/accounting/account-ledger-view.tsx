import Link from "next/link";
import { BookText } from "lucide-react";
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
import { isProfitAndLossType, type AccountLedger } from "../../lib/accounting/account-ledger";
import { ACCOUNT_TYPE_LABEL, ledgerAmount } from "./labels";

/**
 * FIN-7: the transactions behind one statement figure.
 *
 * Laid out the way an account ledger reads on paper — brought forward, each posting with
 * its running balance, carried forward — and ending on the same number the statement
 * showed, labelled as such, so the person who clicked can see the drill-down agrees with
 * what they clicked. Each row opens its journal entry; a row with a source document also
 * opens that document's own page (FIN-12).
 */
export function AccountLedgerView({
  ledger,
  journalPath,
  documentPath,
}: {
  ledger: AccountLedger;
  journalPath: string;
  documentPath: string;
}) {
  const pl = isProfitAndLossType(ledger.account.type);

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-8 gap-y-3 rounded-2xl border border-border bg-card p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Type</dt>
          <dd className="font-medium">{ACCOUNT_TYPE_LABEL[ledger.account.type]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{pl ? "Before this period" : "Brought forward"}</dt>
          <dd className="font-medium tabular-nums">{pl ? "—" : ledgerAmount.format(ledger.broughtForward)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Movement in period</dt>
          <dd className="font-medium tabular-nums">{ledgerAmount.format(ledger.movement)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{pl ? "On the profit and loss" : "On the balance sheet"}</dt>
          <dd className="font-semibold tabular-nums">{ledgerAmount.format(ledger.statementAmount)}</dd>
        </div>
      </dl>

      {ledger.truncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-subtle">
          This period has more entries on this account than fit on one page, so only the earliest
          are listed. The totals above are still the whole period&apos;s — narrow the dates to see the rest.
        </p>
      ) : null}

      {ledger.lines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center">
          <BookText className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="max-w-md text-sm text-muted-foreground">
            Nothing was posted to this account in this period
            {pl ? "." : " — its balance is what it brought forward."}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {ledger.lines.map((line, i) => (
              <li key={`${line.entryId}-${i}`} className="flex flex-col gap-1 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`${journalPath}/${line.entryId}`} className="font-medium text-primary hover:underline">
                      {line.entryNumber ?? "Entry"}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatDate(line.postingDate)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">
                      {ledgerAmount.format(line.debit > 0 ? line.debit : line.credit)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">{line.debit > 0 ? "Dr" : "Cr"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">Balance {ledgerAmount.format(line.runningBalance)}</p>
                  </div>
                </div>
                <p className="break-words text-muted-foreground">{line.lineMemo ?? line.entryMemo ?? describeEntrySource(sourceOf(line))}</p>
                {line.sourceDocumentId ? (
                  <Link href={`${documentPath}/${line.sourceDocumentId}`} className="self-start text-xs text-primary hover:underline">
                    Source document
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Date</TableHead>
                <TableHead className="w-32">Entry</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-36 text-right">Debit</TableHead>
                <TableHead className="w-36 text-right">Credit</TableHead>
                <TableHead className="w-40 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pl ? null : (
                <TableRow className="text-muted-foreground hover:bg-transparent">
                  <TableCell colSpan={5}>Brought forward</TableCell>
                  <TableCell className="text-right tabular-nums">{ledgerAmount.format(ledger.broughtForward)}</TableCell>
                </TableRow>
              )}
              {ledger.lines.map((line, i) => (
                <TableRow key={`${line.entryId}-${i}`}>
                  <TableCell className="text-muted-foreground">{formatDate(line.postingDate)}</TableCell>
                  <TableCell>
                    <Link href={`${journalPath}/${line.entryId}`} className="text-primary hover:underline">
                      {line.entryNumber ?? "Entry"}
                    </Link>
                    {line.status === "reversed" ? (
                      <StatusBadge status="reversed" label={JOURNAL_STATUS_LABEL.reversed} className="ml-2" />
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="line-clamp-2 break-words">
                      {line.lineMemo ?? line.entryMemo ?? describeEntrySource(sourceOf(line))}
                    </span>
                    {line.sourceDocumentId ? (
                      <Link href={`${documentPath}/${line.sourceDocumentId}`} className="text-xs text-primary hover:underline">
                        Source document
                      </Link>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{line.debit > 0 ? ledgerAmount.format(line.debit) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{line.credit > 0 ? ledgerAmount.format(line.credit) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ledgerAmount.format(line.runningBalance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
                <TableCell colSpan={3}>{pl ? "Total for the period" : "Carried forward"}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(ledger.periodDebit)}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(ledger.periodCredit)}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(ledger.statementAmount)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function sourceOf(line: AccountLedger["lines"][number]) {
  return { source_module: line.sourceModule, source_entity_type: line.sourceEntityType, posting_rule_key: null };
}
