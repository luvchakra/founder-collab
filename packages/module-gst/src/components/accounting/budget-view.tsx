import { Target, TrendingDown, TrendingUp } from "lucide-react";
import { StatCard } from "@cofounderai/core/ui/stat-card";
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
import { notableVariances, type BudgetSummary, type VarianceDirection } from "../../lib/accounting/budgets";

/** Favourable is green and adverse red whatever the arithmetic sign — an expense under
 * budget and revenue over budget are both good news, and they have opposite signs. */
const TONE: Record<VarianceDirection, string> = {
  favourable: "text-success-subtle",
  adverse: "text-destructive-subtle",
  on_budget: "text-muted-foreground",
};

export function BudgetView({ summary, basePath }: { summary: BudgetSummary & { hasBudget: boolean }; basePath: string }) {
  if (!summary.hasBudget) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
        <Target className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="max-w-md">
          <p className="font-medium">No budget set for this period</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a monthly figure against the income and cost accounts you want to watch, and
            this fills in from the ledger as the period runs.
          </p>
        </div>
      </div>
    );
  }

  const notable = notableVariances(summary);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Budgeted profit" value={ledgerAmount.format(summary.budgetedProfit)} tone="primary" />
        <StatCard
          label="Actual profit"
          value={ledgerAmount.format(summary.actualProfit)}
          tone={summary.actualProfit >= 0 ? "success" : "destructive"}
        />
        <StatCard
          label={summary.profitDirection === "adverse" ? "Behind budget" : "Ahead of budget"}
          value={ledgerAmount.format(Math.abs(summary.profitVariance))}
          icon={summary.profitDirection === "adverse" ? TrendingDown : TrendingUp}
          tone={summary.profitDirection === "adverse" ? "destructive" : "success"}
        />
      </div>

      {notable.length > 0 ? (
        <section className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
          {/* A report that lists forty accounts in number order buries the three that
              matter, so the ones that matter are lifted out. */}
          <p className="text-sm font-semibold">Worth a look</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {notable.map((row) => (
              <li key={row.accountId} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-medium">{row.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {row.type === "income" ? "is behind" : "is over"} budget
                  </span>
                </span>
                <span className="tabular-nums text-destructive-subtle">
                  {ledgerAmount.format(Math.abs(row.variance))}
                  {row.percentOfBudget !== null ? ` (${Math.abs(row.percentOfBudget).toFixed(0)}%)` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="rounded-2xl border border-border">
        <ul className="divide-y md:hidden">
          {summary.rows.map((row) => (
            <li key={row.accountId} className="flex flex-col gap-1 p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-medium break-words">{row.name}</span>
                <span className={cn("shrink-0 tabular-nums", TONE[row.direction])}>
                  {row.direction === "on_budget" ? "On budget" : ledgerAmount.format(row.variance)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                <span>Budget {ledgerAmount.format(row.budgeted)}</span>
                <span>Actual {ledgerAmount.format(row.actual)}</span>
              </div>
            </li>
          ))}
        </ul>

        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Number</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="w-32">Type</TableHead>
              <TableHead className="w-36 text-right">Budget</TableHead>
              <TableHead className="w-36 text-right">Actual</TableHead>
              <TableHead className="w-40 text-right">Variance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.rows.map((row) => (
              <TableRow key={row.accountId}>
                <TableCell className="text-muted-foreground tabular-nums">{row.accountNumber}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell className="text-muted-foreground">{ACCOUNT_TYPE_LABEL[row.type]}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(row.budgeted)}</TableCell>
                <TableCell className="text-right tabular-nums">{ledgerAmount.format(row.actual)}</TableCell>
                <TableCell className={cn("text-right tabular-nums", TONE[row.direction])}>
                  {row.direction === "on_budget" ? "—" : ledgerAmount.format(row.variance)}
                  {row.percentOfBudget !== null && row.direction !== "on_budget" ? (
                    <span className="ml-1 text-xs">({row.percentOfBudget.toFixed(0)}%)</span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Actuals come from the same ledger totals the profit and loss account reads, so the two
        can never disagree. Set budgets from the{" "}
        <a href={`${basePath}/accounts`} className="underline">
          chart of accounts
        </a>
        .
      </p>
    </div>
  );
}
