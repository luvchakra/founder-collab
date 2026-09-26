import { cache } from "react";
import { createClient } from "../../db/server";
import { entryTotals } from "./journal";
import type { JournalEntryStatus } from "./journal";
import type { AccountType } from "./types";

export interface JournalEntryRow {
  id: string;
  entry_number: string | null;
  posting_date: string;
  memo: string | null;
  status: JournalEntryStatus;
  source_module: string | null;
  source_entity_type: string | null;
  posting_rule_key: string | null;
  reversal_of_entry_id: string | null;
  /** The `core.documents` row an automatic entry was posted from -- what FIN-12's
   * document-to-entries view is keyed on. Null for a manual entry. */
  source_document_id: string | null;
  /** Sum of the entry's debits — its size as a statement would read it. */
  amount: number;
  /** False for a draft someone left half-built; never false for a posted entry, since
   * the database refuses to post one. */
  balanced: boolean;
}

export interface JournalLineRow {
  id: string;
  line_number: number;
  account_id: string;
  account_number: string;
  account_name: string;
  account_type: AccountType;
  debit: number;
  credit: number;
  memo: string | null;
  tax_code: string | null;
}

export interface JournalEntryDetail extends JournalEntryRow {
  lines: JournalLineRow[];
  document_date: string | null;
  posting_rule_version: number | null;
  posted_at: string | null;
}

const ENTRY_COLUMNS =
  "id, entry_number, posting_date, memo, status, source_module, source_entity_type, source_document_id, posting_rule_key, posting_rule_version, reversal_of_entry_id, document_date, posted_at";

type RawEntry = Omit<JournalEntryDetail, "amount" | "balanced" | "lines">;

/** The journal, newest first. The page size is a cap, not a pager: the ledger is browsed
 * by period and by account (both filtered here), not by scrolling to the beginning of
 * time. */
export const listJournalEntries = cache(
  async (
    businessId: string,
    filters: { status?: JournalEntryStatus; from?: string; to?: string; limit?: number } = {},
  ): Promise<JournalEntryRow[]> => {
    const supabase = await createClient();
    let query = supabase
      .from("journal_entries")
      .select(ENTRY_COLUMNS)
      .eq("business_id", businessId)
      .order("posting_date", { ascending: false })
      .order("entry_number", { ascending: false })
      .limit(filters.limit ?? 100);

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.from) query = query.gte("posting_date", filters.from);
    if (filters.to) query = query.lte("posting_date", filters.to);

    const { data, error } = await query;
    if (error) throw error;

    const entries = (data ?? []) as RawEntry[];
    if (entries.length === 0) return [];

    // One follow-up query for the lines of exactly the entries listed, rather than a
    // per-entry round trip or a join that would multiply every entry by its line count.
    const { data: lines, error: lineError } = await supabase
      .from("journal_lines")
      .select("entry_id, account_id, debit, credit")
      .eq("business_id", businessId)
      .in("entry_id", entries.map((e) => e.id));
    if (lineError) throw lineError;

    type RawTotalLine = { entry_id: string; account_id: string; debit: number; credit: number };
    const linesByEntry = new Map<string, { accountId: string; debit: number; credit: number }[]>();
    for (const line of (lines ?? []) as RawTotalLine[]) {
      linesByEntry.set(line.entry_id, [
        ...(linesByEntry.get(line.entry_id) ?? []),
        { accountId: line.account_id, debit: Number(line.debit ?? 0), credit: Number(line.credit ?? 0) },
      ]);
    }

    return entries.map((entry) => {
      const totals = entryTotals(linesByEntry.get(entry.id) ?? []);
      return { ...entry, amount: totals.amount, balanced: totals.balanced };
    });
  },
);

type Supabase = Awaited<ReturnType<typeof createClient>>;

type RawLine = Omit<JournalLineRow, "account_number" | "account_name" | "account_type"> & {
  entry_id: string;
  accounts: { account_number: string; name: string; type: AccountType } | null;
};

/** The lines of the given entries, each naming the account it hit, grouped by entry. */
async function loadLines(
  supabase: Supabase,
  businessId: string,
  entryIds: string[],
): Promise<Map<string, JournalLineRow[]>> {
  const byEntry = new Map<string, JournalLineRow[]>();
  if (entryIds.length === 0) return byEntry;

  const { data, error } = await supabase
    .from("journal_lines")
    .select("id, entry_id, line_number, account_id, debit, credit, memo, tax_code, accounts(account_number, name, type)")
    .eq("business_id", businessId)
    .in("entry_id", entryIds)
    .order("line_number", { ascending: true });
  if (error) throw error;

  for (const line of (data ?? []) as unknown as RawLine[]) {
    byEntry.set(line.entry_id, [
      ...(byEntry.get(line.entry_id) ?? []),
      {
        id: line.id,
        line_number: line.line_number,
        account_id: line.account_id,
        account_number: line.accounts?.account_number ?? "",
        account_name: line.accounts?.name ?? "Unknown account",
        account_type: line.accounts?.type ?? "asset",
        debit: Number(line.debit ?? 0),
        credit: Number(line.credit ?? 0),
        memo: line.memo,
        tax_code: line.tax_code,
      },
    ]);
  }
  return byEntry;
}

function withLines(entry: RawEntry, lines: JournalLineRow[]): JournalEntryDetail {
  const totals = entryTotals(lines.map((l) => ({ accountId: l.account_id, debit: l.debit, credit: l.credit })));
  return { ...entry, lines, amount: totals.amount, balanced: totals.balanced };
}

/** One entry with its lines, each naming the account it hit — the drill-down behind a
 * balance. Returns null rather than throwing for an entry this caller cannot see, since
 * RLS makes "someone else's entry" and "no such entry" the same thing. */
export const getJournalEntry = cache(
  async (businessId: string, entryId: string): Promise<JournalEntryDetail | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("journal_entries")
      .select(ENTRY_COLUMNS)
      .eq("business_id", businessId)
      .eq("id", entryId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const lines = await loadLines(supabase, businessId, [entryId]);
    return withLines(data as RawEntry, lines.get(entryId) ?? []);
  },
);

/**
 * FIN-12 (explainable accounting, in reverse): every entry a source document caused, with
 * its lines.
 *
 * Three kinds of entry point back at a document: its own posting (and, for goods, the
 * separate cost-of-sale entry), each payment allocated against it -- both carry
 * `source_document_id` -- and any reversal of either, which carries only
 * `reversal_of_entry_id`. The reversals are fetched in a second step for that reason:
 * leaving them out would show a reversed invoice as still sitting in the ledger.
 *
 * Oldest first, because the answer to "what did this invoice do to the books?" is a
 * story told in order: posted, paid, perhaps reversed.
 */
export const listJournalEntriesForDocument = cache(
  async (businessId: string, documentId: string): Promise<JournalEntryDetail[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("journal_entries")
      .select(ENTRY_COLUMNS)
      .eq("business_id", businessId)
      .eq("source_document_id", documentId);
    if (error) throw error;

    const direct = (data ?? []) as RawEntry[];
    if (direct.length === 0) return [];

    const { data: reversals, error: reversalError } = await supabase
      .from("journal_entries")
      .select(ENTRY_COLUMNS)
      .eq("business_id", businessId)
      .in("reversal_of_entry_id", direct.map((e) => e.id));
    if (reversalError) throw reversalError;

    const seen = new Set<string>();
    const entries = [...direct, ...((reversals ?? []) as RawEntry[])].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    const lines = await loadLines(supabase, businessId, entries.map((e) => e.id));
    return entries
      .map((entry) => withLines(entry, lines.get(entry.id) ?? []))
      .sort(
        (a, b) =>
          a.posting_date.localeCompare(b.posting_date) ||
          (a.entry_number ?? "").localeCompare(b.entry_number ?? ""),
      );
  },
);
