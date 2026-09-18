import { cache } from "react";
import { createClient } from "../../db/server";
import { suggestMatches, type BankLine, type MatchCandidate, type MatchSuggestion } from "./bank-matching";

export interface BankAccountRow {
  id: string;
  name: string;
  bank_name: string | null;
  account_number_last4: string | null;
  account_type: string;
  ledger_account_id: string | null;
  opening_balance: number;
  is_active: boolean;
}

export interface BankAccountWithPosition extends BankAccountRow {
  /** Opening balance plus every transaction on the account — what this account holds
   * according to the statement lines we hold, which is not the same as what the ledger
   * says until the two are reconciled. */
  statementBalance: number;
  unmatchedCount: number;
  transactionCount: number;
}

export interface BankTransactionRow {
  id: string;
  bank_account_id: string;
  txn_date: string;
  description: string;
  reference: string | null;
  amount: number;
  balance_after: number | null;
  status: "unmatched" | "matched" | "reconciled" | "ignored";
  matched_entry_id: string | null;
}

export const listBankAccounts = cache(
  async (businessId: string): Promise<BankAccountWithPosition[]> => {
    const supabase = await createClient();
    const [{ data: accounts, error }, { data: transactions, error: txnError }] = await Promise.all([
      supabase
        .from("bank_accounts")
        .select("id, name, bank_name, account_number_last4, account_type, ledger_account_id, opening_balance, is_active")
        .eq("business_id", businessId)
        .order("name", { ascending: true }),
      supabase.from("bank_transactions").select("bank_account_id, amount, status").eq("business_id", businessId),
    ]);
    if (error) throw error;
    if (txnError) throw txnError;

    const byAccount = new Map<string, { total: number; unmatched: number; count: number }>();
    for (const txn of (transactions ?? []) as { bank_account_id: string; amount: number; status: string }[]) {
      const current = byAccount.get(txn.bank_account_id) ?? { total: 0, unmatched: 0, count: 0 };
      current.total += Number(txn.amount ?? 0);
      current.count += 1;
      if (txn.status === "unmatched") current.unmatched += 1;
      byAccount.set(txn.bank_account_id, current);
    }

    return ((accounts ?? []) as BankAccountRow[]).map((account) => {
      const totals = byAccount.get(account.id) ?? { total: 0, unmatched: 0, count: 0 };
      return {
        ...account,
        opening_balance: Number(account.opening_balance ?? 0),
        statementBalance: Math.round((Number(account.opening_balance ?? 0) + totals.total) * 100) / 100,
        unmatchedCount: totals.unmatched,
        transactionCount: totals.count,
      };
    });
  },
);

export const listBankTransactions = cache(
  async (businessId: string, bankAccountId: string, limit = 200): Promise<BankTransactionRow[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bank_transactions")
      .select("id, bank_account_id, txn_date, description, reference, amount, balance_after, status, matched_entry_id")
      .eq("business_id", businessId)
      .eq("bank_account_id", bankAccountId)
      .order("txn_date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return ((data ?? []) as BankTransactionRow[]).map((row) => ({ ...row, amount: Number(row.amount ?? 0) }));
  },
);

export interface TransactionWithSuggestions {
  transaction: BankTransactionRow;
  suggestions: MatchSuggestion[];
}

/**
 * Unmatched lines, each with the ledger entries that might explain it.
 *
 * Candidates are drawn from entries that touch this bank account's own ledger account,
 * within the window matching allows — asking the database for a narrow slice rather than
 * scoring every entry the business has ever posted.
 *
 * Nothing here decides anything: `suggestMatches` ranks, and a person accepts.
 */
export async function getUnmatchedWithSuggestions(
  businessId: string,
  bankAccountId: string,
  ledgerAccountId: string | null,
  limit = 50,
): Promise<TransactionWithSuggestions[]> {
  const transactions = (await listBankTransactions(businessId, bankAccountId)).filter(
    (t) => t.status === "unmatched",
  );
  if (transactions.length === 0 || !ledgerAccountId) {
    return transactions.slice(0, limit).map((transaction) => ({ transaction, suggestions: [] }));
  }

  const dates = transactions.map((t) => t.txn_date).sort();
  const windowStart = shiftDate(dates[0]!, -7);
  const windowEnd = shiftDate(dates[dates.length - 1]!, 7);

  const supabase = await createClient();
  const { data: lines, error } = await supabase
    .from("journal_lines")
    .select("entry_id, debit, credit, journal_entries(id, entry_number, posting_date, memo, status)")
    .eq("business_id", businessId)
    .eq("account_id", ledgerAccountId);
  if (error) throw error;

  type RawLine = {
    entry_id: string;
    debit: number;
    credit: number;
    journal_entries: {
      id: string;
      entry_number: string | null;
      posting_date: string;
      memo: string | null;
      status: string;
    } | null;
  };

  const candidates: MatchCandidate[] = [];
  for (const line of (lines ?? []) as unknown as RawLine[]) {
    const entry = line.journal_entries;
    if (!entry || entry.status !== "posted") continue;
    if (entry.posting_date < windowStart || entry.posting_date > windowEnd) continue;
    candidates.push({
      entryId: entry.id,
      entryNumber: entry.entry_number,
      postingDate: entry.posting_date,
      // A debit to the bank account is money in, which is how a statement line signs it.
      amount: Math.round((Number(line.debit ?? 0) - Number(line.credit ?? 0)) * 100) / 100,
      memo: entry.memo,
      reference: entry.entry_number,
    });
  }

  return transactions.slice(0, limit).map((transaction) => {
    const line: BankLine = {
      id: transaction.id,
      txnDate: transaction.txn_date,
      amount: transaction.amount,
      description: transaction.description,
      reference: transaction.reference,
    };
    return { transaction, suggestions: suggestMatches(line, candidates) };
  });
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
