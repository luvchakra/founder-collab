// EXP-FIN-13 -- Filing Readiness export (/finance/filing-readiness).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listUnpostedDocuments, type UnpostedDocument } from "../lib/accounting/dashboard-queries";
import { listBankAccounts, listBankTransactions } from "../lib/accounting/banking-queries";
import { assessFilingReadiness, type ReadinessCheck } from "../lib/accounting/filing-readiness";
import { listAccountingPeriods } from "../lib/accounting/queries";
import { periodForDate } from "../lib/accounting/periods";
import { loadGstPeriodPosition } from "./gst-registers";
import { humanizeCode, moduleLabel, READINESS_STATUS_LABEL } from "./labels";
import { resolveFiscalMonth } from "./periods";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type Filters = { period: string };

/** Which part of the close each check belongs to (the check keys `assessFilingReadiness`
 * emits). */
const CHECK_CATEGORY: Record<string, string> = {
  accounts: "Setup",
  posted: "Ledger",
  reconciled: "GST reconciliation",
  itc: "Input tax credit",
  gstin: "Customer GSTINs",
  bank: "Bank",
  period: "Period close",
};

type CheckRow = ReadinessCheck & { amount: number | null; count: number | null };

/**
 * The page computes readiness inline from nine reads; this adapter repeats those reads and
 * inputs line for line (`loadGstPeriodPosition` for the ledger/registers/2B/ITC half, the
 * rest below) and hands them to the same `assessFilingReadiness`, so every check, status
 * and detail is the page's. Each check row also carries the figure behind it (a money gap
 * or a count), and the Excel workbook lists the period's unposted documents -- the
 * documents behind the "Everything is posted" check. The page reads with no permission
 * check.
 */
export const financeFilingReadinessExport: ExportAdapter<Filters> = {
  id: "finance.filing-readiness",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  // Only a `YYYY-MM` can match a fiscal month; anything else means "this month" either way.
  parseFilters: (params) => ({ period: /^\d{4}-\d{2}$/.test(params.get("period") ?? "") ? params.get("period")! : "" }),
  describeFilters: (f) => ({ Period: f.period }),
  async load(context, filters) {
    const businessId = context.businessId;
    const selected = await resolveFiscalMonth(businessId, filters.period);
    const [{ ledger, sales, twoB, reconciliation, itc }, unposted, periods, bankAccounts, currency] = await Promise.all([
      loadGstPeriodPosition(businessId, selected),
      listUnpostedDocuments(businessId),
      listAccountingPeriods(businessId),
      listBankAccounts(businessId),
      getLedgerCurrency(businessId),
    ]);

    const bankLines = await Promise.all(bankAccounts.map((account) => listBankTransactions(businessId, account.id)));
    const unmatchedBankLines = bankLines
      .flat()
      .filter((line) => line.status === "unmatched" && line.txn_date >= selected.startDate && line.txn_date <= selected.endDate).length;

    const unpostedInPeriod = unposted.filter((d) => d.doc_date >= selected.startDate && d.doc_date <= selected.endDate);
    const invalidGstinCount = sales.b2b.filter((row) => !row.gstin).length;

    const readiness = assessFilingReadiness({
      hasAccounts: ledger.hasAccounts,
      unpostedCount: unpostedInPeriod.length,
      ledgerAgreesWithReturn: reconciliation.agrees,
      ledgerReturnGap: reconciliation.largestGap,
      itcAtRisk: itc.atRisk,
      twoBImported: twoB !== null,
      invalidGstinCount,
      unmatchedBankLines,
      periodStatus: periodForDate(periods, selected.endDate)?.status ?? null,
    });

    const figures: Record<string, { amount: number | null; count: number | null }> = {
      posted: { amount: null, count: unpostedInPeriod.length },
      reconciled: { amount: reconciliation.largestGap, count: null },
      itc: { amount: itc.atRisk, count: null },
      gstin: { amount: null, count: invalidGstinCount },
      bank: { amount: null, count: unmatchedBankLines },
    };
    const checks: CheckRow[] = readiness.checks.map((check) => ({
      ...check,
      amount: figures[check.key]?.amount ?? null,
      count: figures[check.key]?.count ?? null,
    }));

    return {
      module: FINANCE_FILE_MODULE,
      resource: "filing-readiness",
      title: `Filing readiness ${selected.gstPeriod}`,
      metadata: {
        Period: selected.gstPeriod,
        From: selected.startDate,
        To: selected.endDate,
        "Safe to file": readiness.canFile ? "Yes" : "No",
        Summary: readiness.headline,
        Currency: currency,
      },
      sheets: [
        {
          sheetName: "Checks",
          rows: checks,
          columns: [
            { key: "period", header: "Period", getValue: () => selected.gstPeriod },
            { key: "category", header: "Category", getValue: (c: CheckRow) => CHECK_CATEGORY[c.key] ?? humanizeCode(c.key) },
            { key: "check", header: "Check", getValue: (c: CheckRow) => c.label },
            { key: "status", header: "Status", getValue: (c: CheckRow) => READINESS_STATUS_LABEL[c.status] ?? c.status },
            money("amount", "Amount", (c: CheckRow) => c.amount, currency),
            { key: "count", header: "Count", type: "integer", getValue: (c: CheckRow) => c.count },
            { key: "detail", header: "Detail", getValue: (c: CheckRow) => c.detail },
            { key: "action", header: "What to do", getValue: (c: CheckRow) => c.action ?? null },
          ],
        },
        {
          sheetName: "Unposted documents",
          rows: unpostedInPeriod,
          columns: [
            { key: "period", header: "Period", getValue: () => selected.gstPeriod },
            { key: "type", header: "Document type", getValue: (d: UnpostedDocument) => humanizeCode(d.doc_type) },
            { key: "number", header: "Document number", getValue: (d: UnpostedDocument) => d.number },
            { key: "date", header: "Document date", type: "date", getValue: (d: UnpostedDocument) => d.doc_date },
            money("total", "Total", (d: UnpostedDocument) => d.total_amount, currency),
            { key: "source", header: "Source", getValue: (d: UnpostedDocument) => moduleLabel(d.source_module) },
          ],
        },
      ],
    };
  },
};
