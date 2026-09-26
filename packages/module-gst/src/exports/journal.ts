// EXP-FIN-06 -- Journal export (/finance/journal).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { describeEntrySource, entryTotals, JOURNAL_STATUS_LABEL } from "../lib/accounting/journal";
import { listAccountingPeriods } from "../lib/accounting/queries";
import { periodForDate } from "../lib/accounting/periods";
import { humanizeCode, journalSourceLabel } from "./labels";
import { listJournalForExport, type JournalExportEntry, type JournalExportLine } from "./queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type EntryRow = JournalExportEntry & { period: string | null; amount: number; balanced: boolean };
type LineRow = JournalExportLine & { entry: EntryRow };

/**
 * The page lists `listJournalEntries(businessId)` with no filters and stops at the 100
 * most recent entries; it does not paginate. The export is the whole journal through
 * `listJournalForExport` (same table, same business filter, paged), at line level --
 * one row per debit or credit, carrying its entry's number, date, period, source,
 * reference and status -- with an entry-level sheet alongside in Excel. The CSV is the
 * line-level table: that is the journal a ledger import or an auditor reads.
 */
export const financeJournalExport: ExportAdapter<Record<string, never>> = {
  id: "finance.journal",
  module: FINANCE_LICENCE,
  // The page reads with no permission check; `gst.journal.create` only shows "New entry".
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [{ entries, lines }, periods, currency] = await Promise.all([
      listJournalForExport(context.businessId),
      listAccountingPeriods(context.businessId),
      getLedgerCurrency(context.businessId),
    ]);

    const periodById = new Map(periods.map((p) => [p.id, p]));
    const linesByEntry = new Map<string, JournalExportLine[]>();
    for (const line of lines) linesByEntry.set(line.entry_id, [...(linesByEntry.get(line.entry_id) ?? []), line]);

    const entryRows: EntryRow[] = entries.map((entry) => {
      const period = (entry.period_id ? periodById.get(entry.period_id) : undefined) ?? periodForDate(periods, entry.posting_date);
      const totals = entryTotals(
        (linesByEntry.get(entry.id) ?? []).map((l) => ({ accountId: l.account_id, debit: l.debit, credit: l.credit })),
      );
      return { ...entry, period: period?.gst_period ?? null, amount: totals.amount, balanced: totals.balanced };
    });
    const entryById = new Map(entryRows.map((e) => [e.id, e]));
    // Lines in journal order (newest entry first, then line number), each with its entry.
    const lineRows: LineRow[] = entryRows.flatMap((entry) =>
      (linesByEntry.get(entry.id) ?? [])
        .slice()
        .sort((a, b) => a.line_number - b.line_number)
        .map((line) => ({ ...line, entry: entryById.get(entry.id)! })),
    );

    const description = (e: EntryRow) => e.memo ?? describeEntrySource(e);

    return {
      module: FINANCE_FILE_MODULE,
      resource: "journal",
      title: "Journal",
      metadata: { Currency: currency },
      sheets: [
        {
          sheetName: "Journal lines",
          rows: lineRows,
          columns: [
            { key: "entry", header: "Journal number", getValue: (l: LineRow) => l.entry.entry_number },
            { key: "date", header: "Posting date", type: "date", getValue: (l: LineRow) => l.entry.posting_date },
            { key: "period", header: "Period", getValue: (l: LineRow) => l.entry.period },
            { key: "source", header: "Source", getValue: (l: LineRow) => journalSourceLabel(l.entry.source_module) },
            { key: "reference", header: "Reference", getValue: (l: LineRow) => l.entry.sourceDocumentNumber },
            { key: "line", header: "Line", type: "integer", getValue: (l: LineRow) => l.line_number },
            { key: "account_code", header: "Account code", getValue: (l: LineRow) => l.account_number },
            { key: "account", header: "Account", getValue: (l: LineRow) => l.account_name },
            money("debit", "Debit", (l: LineRow) => l.debit, currency),
            money("credit", "Credit", (l: LineRow) => l.credit, currency),
            { key: "tax_code", header: "Tax code", getValue: (l: LineRow) => l.tax_code },
            { key: "line_memo", header: "Line memo", getValue: (l: LineRow) => l.memo },
            { key: "description", header: "Description", getValue: (l: LineRow) => description(l.entry) },
            { key: "status", header: "Posting status", getValue: (l: LineRow) => JOURNAL_STATUS_LABEL[l.entry.status] ?? l.entry.status },
          ],
        },
        {
          sheetName: "Entries",
          rows: entryRows,
          columns: [
            { key: "entry", header: "Journal number", getValue: (e: EntryRow) => e.entry_number },
            { key: "date", header: "Posting date", type: "date", getValue: (e: EntryRow) => e.posting_date },
            { key: "document_date", header: "Document date", type: "date", getValue: (e: EntryRow) => e.document_date },
            { key: "period", header: "Period", getValue: (e: EntryRow) => e.period },
            { key: "source", header: "Source", getValue: (e: EntryRow) => journalSourceLabel(e.source_module) },
            { key: "source_type", header: "Source type", getValue: (e: EntryRow) => humanizeCode(e.source_entity_type) },
            { key: "reference", header: "Reference", getValue: (e: EntryRow) => e.sourceDocumentNumber },
            { key: "description", header: "Description", getValue: (e: EntryRow) => description(e) },
            money("amount", "Amount", (e: EntryRow) => e.amount, currency),
            { key: "balanced", header: "Balanced", type: "boolean", getValue: (e: EntryRow) => e.balanced },
            { key: "status", header: "Posting status", getValue: (e: EntryRow) => JOURNAL_STATUS_LABEL[e.status] ?? e.status },
            { key: "posted_at", header: "Posted at", type: "datetime", getValue: (e: EntryRow) => e.posted_at },
            {
              key: "reversal_of",
              header: "Reverses entry",
              getValue: (e: EntryRow) => (e.reversal_of_entry_id ? entryById.get(e.reversal_of_entry_id)?.entry_number ?? null : null),
            },
          ],
        },
      ],
    };
  },
};
