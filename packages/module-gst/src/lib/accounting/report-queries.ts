import { cache } from "react";
import { createClient } from "../../db/server";
import { balanceSheet, profitAndLoss, trialBalance, type AccountBalanceInput } from "./reports";
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

/**
 * All three statements from one read of the ledger.
 *
 * Together rather than one query per report, because they are three readings of the same
 * numbers: fetching separately would let a posting land between two of them and leave the
 * balance sheet disagreeing with the profit and loss on the same screen.
 */
export async function getFinancialStatements(businessId: string, period: ReportPeriod) {
  const totals = await getAccountPeriodTotals(businessId, period.from, period.to);
  return {
    trialBalance: trialBalance(totals),
    profitAndLoss: profitAndLoss(totals),
    balanceSheet: balanceSheet(totals),
    hasActivity: totals.some((t) => t.debit !== 0 || t.credit !== 0 || (t.openingBalance ?? 0) !== 0),
  };
}
