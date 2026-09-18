import { cache } from "react";
import { createClient } from "../../db/server";
import { getAccountPeriodTotals } from "./report-queries";
import { summariseBudget, type BudgetLine } from "./budgets";
import type { AccountType } from "./types";

/**
 * Budget against actual for a date range.
 *
 * Actuals come from `gst.account_period_totals` — the same function the profit and loss
 * account reads — rather than a second summation of the ledger. Two figures for "what we
 * actually spent" that could disagree would make both useless.
 *
 * Accounts with neither a budget nor any activity are dropped: a report listing every
 * account in the chart at zero buries the ones being managed.
 */
export const getBudgetVsActual = cache(async (businessId: string, from: string, to: string) => {
  const supabase = await createClient();

  const [{ data: budgets, error }, actuals] = await Promise.all([
    supabase
      .from("budget_lines")
      .select("account_id, amount, period_start")
      .eq("business_id", businessId)
      .gte("period_start", from)
      .lte("period_start", to),
    getAccountPeriodTotals(businessId, from, to),
  ]);
  if (error) throw error;

  const budgetByAccount = new Map<string, number>();
  for (const row of (budgets ?? []) as { account_id: string; amount: number }[]) {
    budgetByAccount.set(row.account_id, (budgetByAccount.get(row.account_id) ?? 0) + Number(row.amount ?? 0));
  }

  // Only the trading accounts: a budget against a bank balance is a cash-flow forecast,
  // which is a different report with different rules.
  const TRADING: AccountType[] = ["income", "cogs", "expense"];

  const lines: BudgetLine[] = actuals
    .filter((a) => TRADING.includes(a.type))
    .map((a) => ({
      accountId: a.accountId,
      accountNumber: a.accountNumber,
      name: a.name,
      type: a.type,
      budgeted: budgetByAccount.get(a.accountId) ?? 0,
      // Income is credit-positive, costs debit-positive — the direction each reads on a
      // statement, so a budget of 100,000 revenue compares against 90,000 earned rather
      // than against −90,000.
      actual: a.type === "income" ? a.credit - a.debit : a.debit - a.credit,
    }))
    .filter((line) => line.budgeted !== 0 || line.actual !== 0);

  return { ...summariseBudget(lines), hasBudget: budgetByAccount.size > 0 };
});
