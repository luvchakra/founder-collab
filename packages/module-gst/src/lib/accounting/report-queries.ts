import { cache } from "react";
import { createClient } from "../../db/server";
import {
  balanceSheet,
  cashFlowStatement,
  profitAndLoss,
  trialBalance,
  type AccountBalanceInput,
  type CashFlowInput,
} from "./reports";
import type { AccountType } from "./types";

export interface ReportPeriod {
  from: string;
  to: string;
}

/**
 * Each account's debit and credit totals for a date range.
 *
 * Aggregated by `gst.account_period_totals` rather than here — see that function's own
 * comment for why summing fetched rows in application code would have produced a
 * quietly-short trial balance for a busy business. RLS on the underlying tables decides
 * what the caller sees, so an unlicensed or non-member caller simply gets nothing.
 */
export const getAccountPeriodTotals = cache(
  async (businessId: string, from: string, to: string): Promise<AccountBalanceInput[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("account_period_totals", {
      p_business_id: businessId,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;

    type Row = {
      account_id: string;
      account_number: string;
      name: string;
      type: AccountType;
      debit: number | string;
      credit: number | string;
      opening_balance: number | string;
    };

    return ((data ?? []) as Row[]).map((row) => ({
      accountId: row.account_id,
      accountNumber: row.account_number,
      name: row.name,
      type: row.type,
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      openingBalance: Number(row.opening_balance ?? 0),
    }));
  },
);

export interface StatementTotals extends AccountBalanceInput {
  subtype: string | null;
  /** Totals from the start of the ledger to the end of the period: a position, which is
   * what the balance sheet reports, as opposed to the period's activity above. */
  debitToDate: number;
  creditToDate: number;
  /** A bank or cash account — see `gst.account_statement_totals`. */
  isCash: boolean;
}

/** Each account's totals for the period and as at its end, from one read of the ledger
 * (`gst.account_statement_totals`). */
export const getStatementTotals = cache(
  async (businessId: string, from: string, to: string): Promise<StatementTotals[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("account_statement_totals", {
      p_business_id: businessId,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;

    type Row = {
      account_id: string;
      account_number: string;
      name: string;
      type: AccountType;
      subtype: string | null;
      debit: number | string;
      credit: number | string;
      debit_to_date: number | string;
      credit_to_date: number | string;
      opening_balance: number | string;
      is_cash: boolean;
    };

    return ((data ?? []) as Row[]).map((row) => ({
      accountId: row.account_id,
      accountNumber: row.account_number,
      name: row.name,
      type: row.type,
      subtype: row.subtype,
      debit: Number(row.debit ?? 0),
      credit: Number(row.credit ?? 0),
      debitToDate: Number(row.debit_to_date ?? 0),
      creditToDate: Number(row.credit_to_date ?? 0),
      openingBalance: Number(row.opening_balance ?? 0),
      isCash: Boolean(row.is_cash),
    }));
  },
);

/** FIN-5: the period's cash movement per counter account (`gst.cash_flow_totals`). */
export const getCashFlowTotals = cache(
  async (businessId: string, from: string, to: string): Promise<CashFlowInput[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cash_flow_totals", {
      p_business_id: businessId,
      p_from: from,
      p_to: to,
    });
    if (error) throw error;

    type Row = {
      account_id: string;
      account_number: string;
      name: string;
      type: AccountType;
      subtype: string | null;
      amount: number | string;
    };
    return ((data ?? []) as Row[]).map((row) => ({
      accountId: row.account_id,
      accountNumber: row.account_number,
      name: row.name,
      type: row.type,
      subtype: row.subtype,
      amount: Number(row.amount ?? 0),
    }));
  },
);

/** Cash and bank at the start and end of the period: opening balances plus everything
 * posted to the cash accounts before (or up to the end of) the period. */
export function cashPosition(totals: StatementTotals[]): { opening: number; closing: number } {
  let opening = 0;
  let closing = 0;
  for (const t of totals) {
    if (!t.isCash) continue;
    const toDate = (t.openingBalance ?? 0) + t.debitToDate - t.creditToDate;
    closing += toDate;
    opening += toDate - (t.debit - t.credit);
  }
  return { opening: Math.round(opening * 100) / 100, closing: Math.round(closing * 100) / 100 };
}

/**
 * All four statements from one read of the ledger (two for the cash flow's own flows).
 *
 * Together rather than one query per report, because they are readings of the same
 * numbers: fetching separately would let a posting land between two of them and leave the
 * balance sheet disagreeing with the profit and loss on the same screen.
 *
 * The profit and loss and trial balance report the period's activity; the balance sheet
 * reports the position as at the period's end (FIN-5 fixed it reading period activity,
 * which dropped every earlier month from a "this month" balance sheet); the cash flow
 * explains the movement in cash between the two ends.
 */
export async function getFinancialStatements(businessId: string, period: ReportPeriod) {
  const [totals, flows] = await Promise.all([
    getStatementTotals(businessId, period.from, period.to),
    getCashFlowTotals(businessId, period.from, period.to),
  ]);
  const asAt = totals.map((t) => ({ ...t, debit: t.debitToDate, credit: t.creditToDate }));
  const cash = cashPosition(totals);
  return {
    trialBalance: trialBalance(totals),
    profitAndLoss: profitAndLoss(totals),
    balanceSheet: balanceSheet(asAt),
    cashFlow: cashFlowStatement(flows, cash.opening, cash.closing),
    hasActivity: totals.some(
      (t) => t.debitToDate !== 0 || t.creditToDate !== 0 || (t.openingBalance ?? 0) !== 0,
    ),
  };
}
