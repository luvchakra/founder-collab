import Link from "next/link";
import { AlertTriangle } from "lucide-react";
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
import { ACCOUNT_TYPE_LABEL, ledgerAmount } from "./labels";
import type { BalanceSheet, ProfitAndLoss, StatementLine, TrialBalance } from "../../lib/accounting/reports";

export type ReportKey = "trial-balance" | "profit-and-loss" | "balance-sheet";

export const REPORT_LABEL: Record<ReportKey, string> = {
  "trial-balance": "Trial balance",
  "profit-and-loss": "Profit & loss",
  "balance-sheet": "Balance sheet",
};

export function isReportKey(value: string): value is ReportKey {
  return value in REPORT_LABEL;
}

/** The three reports share one period and one switcher; picking one is a link, not
 * client state, so a report can be bookmarked and shared as it was read. */
export function ReportTabs({ active, hrefFor }: { active: ReportKey; hrefFor: (key: ReportKey) => string }) {
  return (
    <nav aria-label="Report" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
      {(Object.keys(REPORT_LABEL) as ReportKey[]).map((key) => (
        <Link
          key={key}
          href={hrefFor(key)}
          aria-current={key === active ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            key === active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {REPORT_LABEL[key]}
        </Link>
      ))}
    </nav>
  );
}

/** A statement that doesn't balance means the ledger is broken, not the report. Said
 * plainly and prominently, because the alternative is someone filing from it. */
function OutOfBalanceNotice({ by }: { by: number }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-subtle">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>
        This report is out of balance by {ledgerAmount.format(Math.abs(by))}. That points at the
        ledger itself rather than the report — check for a part-built draft entry before relying on
        these figures.
      </span>
    </p>
  );
}

/** One statement section: its lines, then its total. Below `md` the lines stack as
 * name-over-amount rows rather than a two-column table squeezed to nothing. */
function StatementSection({
  heading,
  lines,
  total,
  emphasis,
}: {
  heading: string;
  lines: StatementLine[];
  total: number;
  emphasis?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border">
      <h3 className="border-b border-border px-4 py-2.5 text-sm font-semibold">{heading}</h3>
      {lines.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nothing in this period.</p>
      ) : (
        <ul className="divide-y">
          {lines.map((line) => (
            <li key={line.accountId} className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
              <span className="min-w-0">
                <span className="text-muted-foreground tabular-nums">{line.accountNumber}</span>{" "}
                {line.name}
              </span>
              <span className="shrink-0 tabular-nums">{ledgerAmount.format(line.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div
        className={cn(
          "flex items-baseline justify-between gap-4 border-t border-border px-4 py-2.5 text-sm font-semibold",
          emphasis && "bg-muted/40",
        )}
      >
        <span>Total {heading.toLowerCase()}</span>
        <span className="tabular-nums">{ledgerAmount.format(total)}</span>
      </div>
    </section>
  );
}

export function TrialBalanceReport({ report }: { report: TrialBalance }) {
  return (
    <div className="flex flex-col gap-3">
      {report.balanced ? null : <OutOfBalanceNotice by={report.totalDebit - report.totalCredit} />}

      <div className="rounded-2xl border border-border">
        {/* Mobile: one row per account, both figures on one line. */}
        <ul className="divide-y md:hidden">
          {report.rows.map((row) => (
            <li key={row.accountId} className="flex items-baseline justify-between gap-3 p-3 text-sm">
              <span className="min-w-0">
                <span className="text-muted-foreground tabular-nums">{row.accountNumber}</span> {row.name}
                <span className="block text-xs text-muted-foreground">{ACCOUNT_TYPE_LABEL[row.type]}</span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                {ledgerAmount.format(row.debit > 0 ? row.debit : row.credit)}
                <span className="block text-xs text-muted-foreground">
                  {row.debit > 0 ? "Debit" : "Credit"}
                </span>
              </span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 bg-muted/40 p-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{ledgerAmount.format(report.totalDebit)}</span>
          </li>
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Number</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-36">Type</TableHead>
              <TableHead className="w-40 text-right">Debit</TableHead>
              <TableHead className="w-40 text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow key={row.accountId}>
                <TableCell className="text-muted-foreground tabular-nums">{row.accountNumber}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{ACCOUNT_TYPE_LABEL[row.type]}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.debit > 0 ? ledgerAmount.format(row.debit) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.credit > 0 ? ledgerAmount.format(row.credit) : "—"}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 font-semibold hover:bg-muted/40">
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{ledgerAmount.format(report.totalDebit)}</TableCell>
              <TableCell className="text-right tabular-nums">{ledgerAmount.format(report.totalCredit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ProfitAndLossReport({ report }: { report: ProfitAndLoss }) {
  return (
    <div className="flex flex-col gap-4">
      <StatementSection heading="Income" lines={report.income} total={report.totalIncome} />
      <StatementSection heading="Cost of sales" lines={report.cogs} total={report.totalCogs} />

      {/* Gross profit gets its own row rather than living inside a section: it is the
          number a founder reads first, and burying it under cost of sales hides it. */}
      <Summary label="Gross profit" amount={report.grossProfit} />

      <StatementSection heading="Expenses" lines={report.expenses} total={report.totalExpenses} />
      <Summary label="Net profit" amount={report.netProfit} emphasis />
    </div>
  );
}

export function BalanceSheetReport({ report }: { report: BalanceSheet }) {
  return (
    <div className="flex flex-col gap-4">
      {report.balanced ? null : (
        <OutOfBalanceNotice by={report.totalAssets - report.totalEquityAndLiabilities} />
      )}

      <StatementSection heading="Assets" lines={report.assets} total={report.totalAssets} emphasis />
      <StatementSection heading="Liabilities" lines={report.liabilities} total={report.totalLiabilities} />
      <StatementSection
        heading="Equity"
        lines={[
          ...report.equity,
          // Until the year is closed nothing has moved trading results into retained
          // earnings, so this line is what makes the sheet balance.
          {
            accountId: "profit-for-period",
            accountNumber: "—",
            name: "Profit for the period",
            amount: report.profitForPeriod,
          },
        ]}
        total={report.totalEquity + report.profitForPeriod}
      />
      <Summary label="Equity and liabilities" amount={report.totalEquityAndLiabilities} emphasis />
    </div>
  );
}

function Summary({ label, amount, emphasis }: { label: string; amount: number; emphasis?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 rounded-2xl border border-border px-4 py-3",
        emphasis ? "bg-primary/5 text-base font-semibold" : "bg-card text-sm font-semibold",
      )}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", amount < 0 && "text-destructive-subtle")}>
        {ledgerAmount.format(amount)}
      </span>
    </div>
  );
}

/** The period every figure on the page is for, said once, where someone printing the
 * report will see it. */
export function ReportPeriodCaption({ from, to }: { from: string; to: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {formatDate(from)} – {formatDate(to)}
    </p>
  );
}
