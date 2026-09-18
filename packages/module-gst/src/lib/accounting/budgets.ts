import type { AccountType } from "./types";

/**
 * Budget against actual.
 *
 * The one piece of real thinking here is which direction is good. Spending less than
 * budgeted on an expense is favourable; earning less than budgeted is adverse — same
 * arithmetic sign, opposite meaning. Getting this backwards produces a report that
 * congratulates a business on missing its revenue target, which is worse than no report.
 */

export type VarianceDirection = "favourable" | "adverse" | "on_budget";

export interface BudgetLine {
  accountId: string;
  accountNumber: string;
  name: string;
  type: AccountType;
  budgeted: number;
  actual: number;
}

export interface VarianceRow extends BudgetLine {
  /** actual − budgeted, signed as the arithmetic gives it. */
  variance: number;
  /** What that sign *means* for this kind of account. */
  direction: VarianceDirection;
  /** Variance as a share of budget, or null when nothing was budgeted — dividing by zero
   * to get "infinitely over budget" is noise, not information. */
  percentOfBudget: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Income is wanted high; costs are wanted low. Balance-sheet accounts are not budgeted
 * against in this report, and default to the cost reading if one ever appears. */
function higherIsBetter(type: AccountType): boolean {
  return type === "income";
}

export function varianceFor(line: BudgetLine): VarianceRow {
  const variance = round2(line.actual - line.budgeted);
  const better = higherIsBetter(line.type);

  const direction: VarianceDirection =
    Math.round(variance * 100) === 0 ? "on_budget" : variance > 0 === better ? "favourable" : "adverse";

  return {
    ...line,
    budgeted: round2(line.budgeted),
    actual: round2(line.actual),
    variance,
    direction,
    percentOfBudget: line.budgeted === 0 ? null : round2((variance / Math.abs(line.budgeted)) * 100),
  };
}

export interface BudgetSummary {
  rows: VarianceRow[];
  totalBudgeted: number;
  totalActual: number;
  /** Income minus costs, budgeted and actual — the only total that means anything across
   * account types. Summing income and expense budgets together would be nonsense. */
  budgetedProfit: number;
  actualProfit: number;
  profitVariance: number;
  profitDirection: VarianceDirection;
}

export function summariseBudget(lines: BudgetLine[]): BudgetSummary {
  const rows = lines
    .map(varianceFor)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  const sum = (pick: (r: VarianceRow) => number, filter: (r: VarianceRow) => boolean) =>
    round2(rows.filter(filter).reduce((total, r) => total + pick(r), 0));

  const isIncome = (r: VarianceRow) => r.type === "income";
  const isCost = (r: VarianceRow) => r.type === "expense" || r.type === "cogs";

  const budgetedProfit = round2(sum((r) => r.budgeted, isIncome) - sum((r) => r.budgeted, isCost));
  const actualProfit = round2(sum((r) => r.actual, isIncome) - sum((r) => r.actual, isCost));
  const profitVariance = round2(actualProfit - budgetedProfit);

  return {
    rows,
    totalBudgeted: sum((r) => r.budgeted, () => true),
    totalActual: sum((r) => r.actual, () => true),
    budgetedProfit,
    actualProfit,
    profitVariance,
    profitDirection:
      Math.round(profitVariance * 100) === 0 ? "on_budget" : profitVariance > 0 ? "favourable" : "adverse",
  };
}

/** Rows worth a founder's attention: the biggest adverse variances first. A budget report
 * that lists forty accounts in number order buries the three that matter. */
export function notableVariances(summary: BudgetSummary, limit = 5): VarianceRow[] {
  return summary.rows
    .filter((r) => r.direction === "adverse")
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, limit);
}
