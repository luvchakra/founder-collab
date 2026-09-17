import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Landmark, Receipt, Wallet } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { StatCard } from "@cofounderai/core/ui/stat-card";
import { formatDate } from "@cofounderai/core/lib/format";
import { ledgerAmount } from "./labels";
import type { FinanceSnapshot, UnpostedDocument } from "../../lib/accounting/dashboard-queries";

/**
 * The money half of the Finance dashboard: what the business holds, what it is owed,
 * what it owes, and what it has earned.
 *
 * Read by posting role rather than account number (see `getFinanceSnapshot`), so these
 * figures and the ledger can never disagree about which account "the bank" is.
 */
export function FinanceSnapshotCards({
  snapshot,
  basePath,
}: {
  snapshot: FinanceSnapshot;
  basePath: string;
}) {
  if (!snapshot.hasAccounts) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-6">
        <div>
          <p className="font-medium">Your books aren&apos;t set up yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set up a chart of accounts and your invoices, bills and payments start posting
            themselves — cash, receivables and profit appear here without anyone keying them in.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href={`${basePath}/accounts`}>Set up chart of accounts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Cash and bank"
        value={ledgerAmount.format(snapshot.cash)}
        icon={Wallet}
        tone="primary"
        href={`${basePath}/accounts`}
      />
      <StatCard
        label="Owed to you"
        value={ledgerAmount.format(snapshot.receivable)}
        detail="Unpaid invoices"
        icon={ArrowDownLeft}
        tone="success"
        href={`${basePath}/accounts`}
      />
      <StatCard
        label="You owe"
        value={ledgerAmount.format(snapshot.payable)}
        detail="Unpaid bills"
        icon={ArrowUpRight}
        tone="warning"
        href={`${basePath}/accounts`}
      />
      <StatCard
        label="Profit this month"
        value={ledgerAmount.format(snapshot.profitThisMonth)}
        detail={`${ledgerAmount.format(snapshot.profitYearToDate)} this financial year`}
        icon={Receipt}
        // A loss is a fact, not an alarm -- it reads in red because that is what the
        // number means, not because something has gone wrong with the software.
        tone={snapshot.profitThisMonth < 0 ? "destructive" : "success"}
        href={`${basePath}/reports?report=profit-and-loss`}
      />
      <StatCard
        label="Net GST position"
        value={ledgerAmount.format(snapshot.gstPosition)}
        detail={snapshot.gstPosition >= 0 ? "Payable to the department" : "Credit in hand"}
        icon={Landmark}
        tone={snapshot.gstPosition >= 0 ? "warning" : "success"}
        href={`${basePath}/filing`}
        className="sm:col-span-2 xl:col-span-1"
      />
    </div>
  );
}

/**
 * Documents that should have reached the ledger and haven't.
 *
 * Shown on the dashboard rather than logged, because automatic posting that silently
 * does nothing is worse than no automatic posting: the business believes its books are
 * keeping themselves, and they aren't. Names the likely cause, since one cause explains
 * nearly every case.
 */
export function UnpostedDocumentsNotice({
  documents,
  basePath,
  hasAccounts,
}: {
  documents: UnpostedDocument[];
  basePath: string;
  hasAccounts: boolean;
}) {
  if (documents.length === 0) return null;

  return (
    <section className="rounded-2xl border border-warning/30 bg-warning/5">
      <div className="flex flex-col gap-2 border-b border-warning/20 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-subtle" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">
              {documents.length} recent {documents.length === 1 ? "document hasn't" : "documents haven't"}{" "}
              reached your ledger
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasAccounts
                ? "These were issued but no accounting entry was created — usually because a posting account isn't mapped yet."
                : "Nothing can post until you set up a chart of accounts."}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href={`${basePath}/accounts`}>
            {hasAccounts ? "Check accounts" : "Set up accounts"}
          </Link>
        </Button>
      </div>

      <ul className="divide-y divide-warning/20">
        {documents.slice(0, 5).map((doc) => (
          <li key={doc.id} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{doc.number ?? doc.doc_type.replace(/_/g, " ")}</span>
              <span className="block text-xs text-muted-foreground">{formatDate(doc.doc_date)}</span>
            </span>
            <span className="shrink-0 tabular-nums">{ledgerAmount.format(Number(doc.total_amount ?? 0))}</span>
          </li>
        ))}
        {documents.length > 5 ? (
          <li className="px-4 py-2 text-xs text-muted-foreground">
            …and {documents.length - 5} more.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
