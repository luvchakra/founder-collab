import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { financeAccountsExport } from "./accounts";
import { financeActivationExport } from "./activation";
import { financeAuditLogExport } from "./audit-log";
import { financeBackfillExport } from "./backfill";
import { financeBankAccountsExport, financeBankTransactionsExport } from "./bank";
import { financeBillsExport, financeExpensesExport } from "./bills";
import { financeBudgetExport } from "./budget";
import { financeDashboardExport } from "./dashboard";
import { financeEvidenceExport } from "./evidence";
import { financeExceptionsExport, financeReconciliationExceptionsExport } from "./exceptions";
import { financeFilingExport } from "./filing";
import { financeFilingReadinessExport } from "./filing-readiness";
import { financeGstLedgerExport } from "./gst-ledger";
import { financeJournalExport } from "./journal";
import { financePayablesExport, financeReceivablesExport } from "./payables";
import { financeRecurringExport } from "./recurring";
import { financeStatementsExport } from "./statements";

/**
 * Every Finance export adapter (EXP-FIN-01..17), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 *
 * EXP-FIN-14 (e-invoice / e-way bill) has no adapter: /finance/einvoicing and
 * /finance/eway-bill are provider-credential forms only, with no transaction list on
 * either page to export (§31 excludes credential forms outright).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const FINANCE_EXPORTS: ExportAdapter<any>[] = [
  financeDashboardExport, // EXP-FIN-01
  financeAccountsExport, // EXP-FIN-02
  financeBillsExport, // EXP-FIN-03
  financeExpensesExport, // EXP-FIN-03
  financePayablesExport, // EXP-FIN-04
  financeReceivablesExport, // EXP-FIN-05
  financeJournalExport, // EXP-FIN-06
  financeGstLedgerExport, // EXP-FIN-07
  financeBankAccountsExport, // EXP-FIN-08
  financeBankTransactionsExport, // EXP-FIN-08
  financeRecurringExport, // EXP-FIN-09
  financeBudgetExport, // EXP-FIN-10
  financeStatementsExport, // EXP-FIN-11
  financeFilingExport, // EXP-FIN-12
  financeFilingReadinessExport, // EXP-FIN-13
  financeExceptionsExport, // EXP-FIN-15
  financeReconciliationExceptionsExport, // EXP-FIN-15 (GSTR-2B / IMS queue)
  financeEvidenceExport, // EXP-FIN-16
  financeAuditLogExport, // EXP-FIN-17
  financeBackfillExport, // EXP-FIN-17
  financeActivationExport, // EXP-FIN-17
];
