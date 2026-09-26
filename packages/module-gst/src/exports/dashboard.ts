// EXP-FIN-01 -- Finance Dashboard export (/finance/dashboard).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { AGING_BUCKETS, AGING_BUCKET_LABELS, type AgingSummary } from "../lib/accounting/aging";
import { listBankAccounts, type BankAccountWithPosition } from "../lib/accounting/banking-queries";
import { getFinanceSnapshot, listUnpostedDocuments, type UnpostedDocument } from "../lib/accounting/dashboard-queries";
import { getFinanceActivation } from "../lib/activation/queries";
import { isFilingOverdue } from "../lib/calendar/overdue";
import { getFilingCalendar } from "../lib/calendar/queries";
import type { FilingObligation } from "../lib/calendar/types";
import { getComplianceDashboard } from "../lib/dashboard/queries";
import { getRiskDashboard } from "../lib/risk/queries";
import type { RiskSignal } from "../lib/risk/types";
import { humanizeCode, moduleLabel, RELATED_ENTITY_LABEL, RISK_KIND_LABEL, RISK_SEVERITY_LABEL } from "./labels";
import { getPayablesForExport, getReceivablesForExport } from "./queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type SummaryRow = { section: string; measure: string; amount: number | null; count: number | null; value: string | null };
type AgingRow = { bucket: string; amount: number };

function agingRows(summary: AgingSummary): AgingRow[] {
  return [
    ...AGING_BUCKETS.map((bucket) => ({ bucket: AGING_BUCKET_LABELS[bucket], amount: summary.buckets[bucket] })),
    { bucket: "Overdue", amount: summary.overdue },
    { bucket: "Total outstanding", amount: summary.totalOutstanding },
  ];
}

/** The upcoming-filings badge wording: Filed, Overdue Nd, the lifecycle stage, or Not
 * started. */
function filingStatus(obligation: FilingObligation, asOf: string): string {
  if (obligation.status === "filed") return "Filed";
  const overdue = isFilingOverdue(obligation, asOf);
  if (overdue.status === "overdue") return `Overdue ${overdue.daysOverdue}d`;
  return obligation.status ? humanizeCode(obligation.status) : "Not started";
}

/**
 * The dashboard's own numbers, never a picture of it (§6): the same reads the page makes
 * (`getFinanceSnapshot`, `getComplianceDashboard`, `getRiskDashboard`, `getFilingCalendar`
 * with the page's window, `listUnpostedDocuments`, `getFinanceActivation`), plus the
 * detail behind its money tiles -- the receivables and payables aging (the export twins of
 * the A/R and A/P pages' loaders) and the bank positions that make up "Cash and bank".
 *
 * Sheets: Summary, Receivables, Payables, Cash, GST, Upcoming filings, Exceptions (the
 * compliance risk signals) and Unposted documents. CSV is the Summary. Only whether
 * e-invoicing / e-way bills are set up is reported -- never the credentials themselves.
 * The page reads with no permission check.
 */
export const financeDashboardExport: ExportAdapter<Record<string, never>> = {
  id: "finance.dashboard",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const businessId = context.businessId;
    const asOf = new Date().toISOString().slice(0, 10);
    const [gst, risk, calendar, snapshot, unposted, activation, receivables, payables, bankAccounts, currency] =
      await Promise.all([
        getComplianceDashboard(businessId),
        getRiskDashboard(businessId, asOf),
        getFilingCalendar(businessId, { monthsBack: 1, monthsForward: 2, quartersBack: 0, quartersForward: 1 }),
        getFinanceSnapshot(businessId),
        listUnpostedDocuments(businessId),
        getFinanceActivation(businessId),
        getReceivablesForExport(businessId),
        getPayablesForExport(businessId),
        listBankAccounts(businessId),
        getLedgerCurrency(businessId),
      ]);
    const upcoming = [...calendar].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);

    const m = (section: string, measure: string, amount: number | null): SummaryRow => ({ section, measure, amount, count: null, value: null });
    const c = (section: string, measure: string, count: number): SummaryRow => ({ section, measure, amount: null, count, value: null });
    const v = (section: string, measure: string, value: string | null): SummaryRow => ({ section, measure, amount: null, count: null, value });

    const summary: SummaryRow[] = [
      m("Money", "Cash and bank", snapshot.hasAccounts ? snapshot.cash : null),
      m("Money", "Owed to you", snapshot.hasAccounts ? snapshot.receivable : null),
      m("Money", "You owe", snapshot.hasAccounts ? snapshot.payable : null),
      m("Money", "Profit this month", snapshot.hasAccounts ? snapshot.profitThisMonth : null),
      m("Money", "Profit, fiscal year to date", snapshot.hasAccounts ? snapshot.profitYearToDate : null),
      m("Money", "Net GST position", snapshot.hasAccounts ? snapshot.gstPosition : null),
      v("GST this month", "Period", gst.period),
      v("GST this month", "GSTIN", gst.gstin),
      m("GST this month", "Payable (input tax credit)", gst.payableThisMonth),
      m("GST this month", "Collected (output tax)", gst.collectedThisMonth),
      c("GST this month", "e-Invoices generated", gst.einvoicesThisMonth),
      c("GST this month", "GSTIN risk (parties)", gst.riskCount),
      c("Attention", "Unposted documents", unposted.length),
      c("Attention", "High risk signals", risk.counts.high),
      c("Attention", "Medium risk signals", risk.counts.medium),
      c("Attention", "Low risk signals", risk.counts.low),
      v("Setup", "Chart of accounts set up", snapshot.hasAccounts ? "Yes" : "No"),
      v("Setup", "Finance activated", activation.activatedAt ? "Yes" : "No"),
      v("Setup", "e-Invoicing set up", gst.einvoiceConfigured ? "Yes" : "No"),
      v("Setup", "e-Way bill set up", gst.ewayBillConfigured ? "Yes" : "No"),
    ];

    const summarySheet: ExportSheet<SummaryRow> = {
      sheetName: "Summary",
      rows: summary,
      columns: [
        { key: "section", header: "Section", getValue: (r) => r.section },
        { key: "measure", header: "Measure", getValue: (r) => r.measure },
        money("amount", "Amount", (r: SummaryRow) => r.amount, currency),
        { key: "count", header: "Count", type: "integer", getValue: (r) => r.count },
        { key: "value", header: "Value", getValue: (r) => r.value },
      ],
    };
    const agingSheet = (sheetName: string, rows: AgingRow[]): ExportSheet<AgingRow> => ({
      sheetName,
      rows,
      columns: [
        { key: "bucket", header: "Aging", getValue: (r) => r.bucket },
        money("amount", "Outstanding", (r: AgingRow) => r.amount, currency),
      ],
    });
    type GstRow = { component: string; amount: number };
    const gstSheet: ExportSheet<GstRow> = {
      sheetName: "GST",
      rows: [
        { component: "CGST collected", amount: gst.cgstCollected },
        { component: "SGST collected", amount: gst.sgstCollected },
        { component: "IGST collected", amount: gst.igstCollected },
        { component: "Total collected (output tax)", amount: gst.collectedThisMonth },
        { component: "Payable (input tax credit)", amount: gst.payableThisMonth },
      ],
      columns: [
        { key: "period", header: "Period", getValue: () => gst.period },
        { key: "component", header: "Component", getValue: (r) => r.component },
        money("amount", "Amount", (r: GstRow) => r.amount, currency),
      ],
    };

    return {
      module: FINANCE_FILE_MODULE,
      resource: "dashboard",
      title: "Finance dashboard",
      metadata: { "As of": asOf, Currency: currency },
      sheets: [
        summarySheet,
        agingSheet("Receivables", agingRows(receivables.summary)),
        agingSheet("Payables", agingRows(payables.summary)),
        {
          sheetName: "Cash",
          rows: bankAccounts,
          columns: [
            { key: "account", header: "Bank account", getValue: (a: BankAccountWithPosition) => a.name },
            { key: "bank", header: "Bank", getValue: (a: BankAccountWithPosition) => a.bank_name },
            { key: "last4", header: "Account number (last 4)", getValue: (a: BankAccountWithPosition) => a.account_number_last4 },
            money("balance", "Balance per statement", (a: BankAccountWithPosition) => a.statementBalance, currency),
            { key: "unmatched", header: "Lines to match", type: "integer", getValue: (a: BankAccountWithPosition) => a.unmatchedCount },
          ],
        },
        gstSheet,
        {
          sheetName: "Upcoming filings",
          rows: upcoming,
          columns: [
            { key: "return", header: "Return", getValue: (o: FilingObligation) => o.returnType.toUpperCase() },
            { key: "from", header: "Period start", type: "date", getValue: (o: FilingObligation) => o.periodStart },
            { key: "to", header: "Period end", type: "date", getValue: (o: FilingObligation) => o.periodEnd },
            { key: "due", header: "Due date", type: "date", getValue: (o: FilingObligation) => o.dueDate },
            { key: "status", header: "Status", getValue: (o: FilingObligation) => filingStatus(o, asOf) },
          ],
        },
        {
          sheetName: "Exceptions",
          rows: risk.signals,
          columns: [
            { key: "kind", header: "Risk", getValue: (s: RiskSignal) => RISK_KIND_LABEL[s.kind] ?? s.kind },
            { key: "severity", header: "Severity", getValue: (s: RiskSignal) => RISK_SEVERITY_LABEL[s.severity] ?? s.severity },
            { key: "summary", header: "Summary", getValue: (s: RiskSignal) => s.summary },
            {
              key: "related",
              header: "Related to",
              getValue: (s: RiskSignal) => (s.relatedEntityType ? RELATED_ENTITY_LABEL[s.relatedEntityType] ?? s.relatedEntityType : null),
            },
            { key: "related_id", header: "Related record", getValue: (s: RiskSignal) => s.relatedEntityId },
          ],
        },
        {
          sheetName: "Unposted documents",
          rows: unposted,
          columns: [
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
