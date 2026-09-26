// EXP-FIN-09 -- Recurring Entries export (/finance/recurring).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listAccounts } from "../lib/accounting/queries";
import { RECURRENCE_LABEL, type RecurringTemplateLine } from "../lib/accounting/recurring";
import { listRecurringEntries, type RecurringEntryWithSchedule } from "../lib/accounting/recurring-queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type LineRow = RecurringTemplateLine & { entry: RecurringEntryWithSchedule; lineNumber: number };

/**
 * Every recurring template as the page lists it (`listRecurringEntries`, unfiltered and
 * uncapped -- templates number in the tens), with the page's own next-run and amount. The
 * accounts each template posts to are its template lines; Excel carries them line by
 * line, the CSV names them on the entry's row. The page reads with no permission check.
 */
export const financeRecurringExport: ExportAdapter<Record<string, never>> = {
  id: "finance.recurring",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [entries, accounts, currency] = await Promise.all([
      listRecurringEntries(context.businessId),
      listAccounts(context.businessId),
      getLedgerCurrency(context.businessId),
    ]);
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const accountName = (id: string) => {
      const account = accountById.get(id);
      return account ? `${account.account_number} ${account.name}` : "Unknown account";
    };
    const lines: LineRow[] = entries.flatMap((entry) =>
      entry.template_lines.map((line, index) => ({ ...line, entry, lineNumber: index + 1 })),
    );

    return {
      module: FINANCE_FILE_MODULE,
      resource: "recurring-entries",
      title: "Recurring entries",
      metadata: { Currency: currency },
      sheets: [
        {
          sheetName: "Recurring entries",
          rows: entries,
          columns: [
            { key: "name", header: "Recurring entry", getValue: (e: RecurringEntryWithSchedule) => e.name },
            { key: "memo", header: "Memo", getValue: (e: RecurringEntryWithSchedule) => e.memo },
            {
              key: "frequency",
              header: "Frequency",
              getValue: (e: RecurringEntryWithSchedule) => RECURRENCE_LABEL[e.frequency] ?? e.frequency,
            },
            { key: "starts", header: "Starts", type: "date", getValue: (e: RecurringEntryWithSchedule) => e.anchor_date },
            { key: "next", header: "Next run", type: "date", getValue: (e: RecurringEntryWithSchedule) => e.nextRunOn },
            { key: "last", header: "Last run", type: "date", getValue: (e: RecurringEntryWithSchedule) => e.last_run_on },
            { key: "ends", header: "Ends", type: "date", getValue: (e: RecurringEntryWithSchedule) => e.end_on },
            {
              key: "accounts",
              header: "Accounts",
              getValue: (e: RecurringEntryWithSchedule) => [...new Set(e.template_lines.map((l) => accountName(l.accountId)))],
            },
            money("amount", "Amount", (e: RecurringEntryWithSchedule) => e.amount, currency),
            { key: "active", header: "Active", type: "boolean", getValue: (e: RecurringEntryWithSchedule) => e.is_active },
          ],
        },
        {
          sheetName: "Template lines",
          rows: lines,
          columns: [
            { key: "entry", header: "Recurring entry", getValue: (l: LineRow) => l.entry.name },
            { key: "line", header: "Line", type: "integer", getValue: (l: LineRow) => l.lineNumber },
            { key: "account_code", header: "Account code", getValue: (l: LineRow) => accountById.get(l.accountId)?.account_number ?? null },
            { key: "account", header: "Account", getValue: (l: LineRow) => accountById.get(l.accountId)?.name ?? "Unknown account" },
            money("debit", "Debit", (l: LineRow) => Number(l.debit) || 0, currency),
            money("credit", "Credit", (l: LineRow) => Number(l.credit) || 0, currency),
            { key: "memo", header: "Line memo", getValue: (l: LineRow) => l.memo ?? null },
          ],
        },
      ],
    };
  },
};
