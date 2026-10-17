import { cache } from "react";
import { createClient } from "../../db/server";
import { getAccountPeriodTotals } from "./report-queries";
import { summariseBudget, type BudgetLine } from "./budgets";
import { BUDGETABLE_ACCOUNT_TYPES } from "./budget-entry";
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

export interface BudgetGridAccount {
  id: string;
  accountNumber: string;
  name: string;
  type: AccountType;
}

/**
 * FIN-BUDGET-ENTRY — what the entry grid needs for one fiscal year: the business's active
 * income, cost of sales and expense accounts, and the figures already set for each month
 * (keyed `accountId|periodStart`). An inactive account still shows when it has figures
 * this year, so a saved budget never disappears from the screen that set it.
 */
export const getBudgetGrid = cache(async (businessId: string, from: string, to: string) => {
  const supabase = await createClient();
  const [{ data: accounts, error: accountsError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, account_number, name, type, is_active")
      .eq("business_id", businessId)
      .in("type", BUDGETABLE_ACCOUNT_TYPES)
      .order("account_number", { ascending: true }),
    supabase
      .from("budget_lines")
      .select("account_id, period_start, amount")
      .eq("business_id", businessId)
      .gte("period_start", from)
      .lte("period_start", to),
  ]);
  if (accountsError) throw accountsError;
  if (linesError) throw linesError;

  const amounts: Record<string, number> = {};
  const budgeted = new Set<string>();
  for (const row of (lines ?? []) as { account_id: string; period_start: string; amount: number | string }[]) {
    amounts[`${row.account_id}|${row.period_start}`] = Number(row.amount);
    budgeted.add(row.account_id);
  }

  const gridAccounts: BudgetGridAccount[] = (
    (accounts ?? []) as { id: string; account_number: string; name: string; type: AccountType; is_active: boolean }[]
  )
    .filter((a) => a.is_active || budgeted.has(a.id))
    .map((a) => ({ id: a.id, accountNumber: a.account_number, name: a.name, type: a.type }));

  return { accounts: gridAccounts, amounts };
});
