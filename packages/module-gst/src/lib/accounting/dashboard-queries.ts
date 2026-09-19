import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { listAccountRoles, listAccounts } from "./queries";
import { getAccountPeriodTotals } from "./report-queries";
import { profitAndLoss } from "./reports";
import { fiscalYearOf, monthlyPeriodsForFiscalYear } from "./periods";
import { POSTABLE_DOC_TYPES } from "./document-events";
import { getActivationSettings } from "../activation/queries";
import type { AccountRoleKey } from "./types";

export interface FinanceSnapshot {
  /** Bank plus cash — what the business can actually spend today. */
  cash: number;
  receivable: number;
  payable: number;
  /** Net GST position: collected on sales less recoverable on purchases. Positive means
   * owed to the tax authority. */
  gstPosition: number;
  profitThisMonth: number;
  profitYearToDate: number;
  /** False when the chart of accounts hasn't been set up, so the caller can say that
   * rather than showing a screen of confident zeroes. */
  hasAccounts: boolean;
}

function sumRoles(
  balanceByAccount: Map<string, number>,
  rolesByAccount: Map<string, AccountRoleKey[]>,
  roles: AccountRoleKey[],
): number {
  let total = 0;
  for (const [accountId, accountRoles] of rolesByAccount) {
    if (accountRoles.some((role) => roles.includes(role))) {
      total += balanceByAccount.get(accountId) ?? 0;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * The four numbers a founder opens Finance to see, plus the trading result behind them.
 *
 * Read by posting role rather than by account number, so a business that renamed or
 * re-pointed its bank account still gets the right figure — the roles are what the
 * posting engine itself resolves, so this and the ledger can never disagree about which
 * account "the bank" is.
 */
export async function getFinanceSnapshot(businessId: string): Promise<FinanceSnapshot> {
  const { fiscalYearStartMonth } = await getActivationSettings(businessId);
  const today = new Date().toISOString().slice(0, 10);
  const fiscalYear = fiscalYearOf(today, fiscalYearStartMonth);
  const year = monthlyPeriodsForFiscalYear(fiscalYear, fiscalYearStartMonth);
  const thisMonth = year.find((p) => p.startDate <= today && today <= p.endDate) ?? year[0]!;

  const [accounts, roles, monthTotals, yearTotals] = await Promise.all([
    listAccounts(businessId),
    listAccountRoles(businessId),
    getAccountPeriodTotals(businessId, thisMonth.startDate, thisMonth.endDate),
    getAccountPeriodTotals(businessId, year[0]!.startDate, thisMonth.endDate),
  ]);

  const balanceByAccount = new Map(accounts.map((a) => [a.id, a.balance]));

  return {
    cash: sumRoles(balanceByAccount, roles, ["bank", "cash"]),
    receivable: sumRoles(balanceByAccount, roles, ["accounts_receivable"]),
    payable: sumRoles(balanceByAccount, roles, ["accounts_payable"]),
    gstPosition:
      sumRoles(balanceByAccount, roles, ["gst_payable"]) - sumRoles(balanceByAccount, roles, ["input_gst"]),
    profitThisMonth: profitAndLoss(monthTotals).netProfit,
    profitYearToDate: profitAndLoss(yearTotals).netProfit,
    hasAccounts: accounts.length > 0,
  };
}

export interface UnpostedDocument {
  id: string;
  doc_type: string;
  number: string | null;
  doc_date: string;
  total_amount: number;
  source_module: string;
}

/**
 * Documents that should have reached the ledger and haven't.
 *
 * This exists because a posting refusal is otherwise invisible: a business whose chart of
 * accounts isn't set up sees its invoices simply not appear in the journal, with nothing
 * anywhere saying why. Automatic posting that silently does nothing is worse than no
 * automatic posting.
 *
 * Deliberately scoped to the most recent documents rather than the whole history, and
 * presented as such: this is a "something is wrong, here is what" prompt, not a report to
 * reconcile against. FIN-2's own backfill scan calls this with a much higher limit when it
 * needs the whole history instead.
 */
export async function listUnpostedDocuments(
  businessId: string,
  limit = 50,
): Promise<UnpostedDocument[]> {
  const core = await createCoreClient({ schema: "core" });
  const { data: documents, error } = await core
    .from("documents")
    .select("id, doc_type, number, doc_date, total_amount, source_module, status")
    .eq("business_id", businessId)
    .in("doc_type", POSTABLE_DOC_TYPES)
    .not("status", "in", "(draft,cancelled)")
    .order("doc_date", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const candidates = (documents ?? []) as (UnpostedDocument & { status: string })[];
  if (candidates.length === 0) return [];

  const gst = await createClient();
  const { data: posted, error: postedError } = await gst
    .from("journal_entries")
    .select("source_document_id")
    .eq("business_id", businessId)
    .in("source_document_id", candidates.map((d) => d.id));
  if (postedError) throw postedError;

  const postedIds = new Set(
    (posted ?? []).map((row: { source_document_id: string | null }) => row.source_document_id),
  );
  return candidates.filter((doc) => !postedIds.has(doc.id));
}
