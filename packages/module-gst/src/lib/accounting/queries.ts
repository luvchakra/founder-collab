import { cache } from "react";
import { createClient } from "../../db/server";
import { orderAccountTree, sumByType, type AccountRow } from "./tree";
import type { PeriodStatus } from "./periods";
import type { AccountRoleKey } from "./types";

export type { AccountRow, AccountTypeTotal, AccountWithBalance } from "./tree";

/**
 * The business's Chart of Accounts with balances, ordered as a tree.
 *
 * Two queries rather than a join, because balances come from a view that already
 * aggregates the journal -- joining them in SQL would re-aggregate per account row, and
 * the account list is small enough (tens, not thousands) that matching them up here is
 * both cheaper and easier to read. RLS on both means an unlicensed or non-member caller
 * simply sees nothing.
 */
export const listAccounts = cache(async (businessId: string) => {
  const supabase = await createClient();

  const [{ data: accounts, error }, { data: balances, error: balanceError }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, account_number, name, type, subtype, parent_account_id, is_active, is_system, opening_balance")
      .eq("business_id", businessId)
      .order("account_number", { ascending: true }),
    supabase.from("account_balances").select("account_id, balance").eq("business_id", businessId),
  ]);
  if (error) throw error;
  if (balanceError) throw balanceError;

  const balanceByAccount = new Map(
    (balances ?? []).map((b: { account_id: string; balance: number | string }) => [
      b.account_id,
      Number(b.balance ?? 0),
    ]),
  );

  return orderAccountTree((accounts ?? []) as AccountRow[], balanceByAccount);
});

/** Section totals for the Chart of Accounts summary, from the same derived balances. */
export async function getAccountTypeTotals(businessId: string) {
  return sumByType(await listAccounts(businessId));
}

export interface AccountMapping {
  role_key: AccountRoleKey;
  account_id: string;
}

/**
 * Which posting role each account currently serves, keyed by account id.
 *
 * Shown on the Chart of Accounts so a founder can see *why* an account exists before
 * they try to rename or deactivate it -- "Accounts Receivable" being the target of every
 * automatic invoice posting is not obvious from the name alone once it has been renamed
 * to something like "Customer dues".
 */
export const listAccountRoles = cache(async (businessId: string): Promise<Map<string, AccountRoleKey[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("account_mappings")
    .select("role_key, account_id")
    .eq("business_id", businessId);
  if (error) throw error;

  const byAccount = new Map<string, AccountRoleKey[]>();
  for (const row of (data ?? []) as AccountMapping[]) {
    byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), row.role_key]);
  }
  return byAccount;
});

export interface AccountingPeriodRow {
  id: string;
  fiscal_year: number;
  start_date: string;
  end_date: string;
  gst_period: string | null;
  status: PeriodStatus;
  closed_at: string | null;
}

/** The business's accounting calendar, newest period first — the close works backwards
 * from the month that just ended, so that is the one to have at the top. */
export const listAccountingPeriods = cache(async (businessId: string): Promise<AccountingPeriodRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("id, fiscal_year, start_date, end_date, gst_period, status, closed_at")
    .eq("business_id", businessId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AccountingPeriodRow[];
});
