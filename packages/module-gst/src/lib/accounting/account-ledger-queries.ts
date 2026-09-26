import { cache } from "react";
import { createClient } from "../../db/server";
import { buildAccountLedger, type AccountLedger, type RawLedgerLine } from "./account-ledger";
import { getStatementTotals } from "./report-queries";
import type { JournalEntryStatus } from "./journal";

/** A cap on the listed entries, not on the totals: the totals come from the ledger
 * aggregate and are always the whole period's. A period with more entries than this on one
 * account is read by narrowing the period, which the page says when it happens. */
const LINE_LIMIT = 500;

type RawEntry = {
  id: string;
  entry_number: string | null;
  posting_date: string;
  memo: string | null;
  status: JournalEntryStatus;
  source_module: string | null;
  source_entity_type: string | null;
  source_document_id: string | null;
  journal_lines: { debit: number | string; credit: number | string; memo: string | null }[];
};

/**
 * FIN-7: one account's transactions for a period — the drill-down behind every statement
 * line.
 *
 * The totals come from `getStatementTotals`, the same read (and, with `cache`, the same
 * call) the statements page made, so the drill-down lands on exactly the figure that was
 * clicked. The entries are read parent-first — journal entries that have a line on this
 * account — so they can be ordered by posting date in the database; RLS on both tables
 * (tenant AND licensed) decides what is visible, and an account id from another business
 * is simply not found.
 */
export const getAccountLedger = cache(
  async (businessId: string, accountId: string, from: string, to: string): Promise<AccountLedger | null> => {
    const totals = await getStatementTotals(businessId, from, to);
    const account = totals.find((t) => t.accountId === accountId);
    if (!account) return null;

    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from("journal_entries")
      .select(
        "id, entry_number, posting_date, memo, status, source_module, source_entity_type, source_document_id, journal_lines!inner(debit, credit, memo)",
        { count: "exact" },
      )
      .eq("business_id", businessId)
      .eq("journal_lines.account_id", accountId)
      .in("status", ["posted", "reversed"])
      .gte("posting_date", from)
      .lte("posting_date", to)
      .order("posting_date", { ascending: true })
      .order("entry_number", { ascending: true })
      .limit(LINE_LIMIT);
    if (error) throw error;

    const entries = (data ?? []) as unknown as RawEntry[];
    const lines: RawLedgerLine[] = entries.flatMap((entry) =>
      entry.journal_lines.map((line) => ({
        entryId: entry.id,
        entryNumber: entry.entry_number,
        postingDate: entry.posting_date,
        entryMemo: entry.memo,
        status: entry.status,
        sourceModule: entry.source_module,
        sourceEntityType: entry.source_entity_type,
        sourceDocumentId: entry.source_document_id,
        lineMemo: line.memo,
        debit: Number(line.debit ?? 0),
        credit: Number(line.credit ?? 0),
      })),
    );

    return buildAccountLedger({
      account: { id: account.accountId, accountNumber: account.accountNumber, name: account.name, type: account.type },
      openingBalance: account.openingBalance ?? 0,
      priorDebit: account.debitToDate - account.debit,
      priorCredit: account.creditToDate - account.credit,
      periodDebit: account.debit,
      periodCredit: account.credit,
      lines,
      truncated: (count ?? entries.length) > entries.length,
    });
  },
);
