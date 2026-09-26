// EXP-FIN-04 (Payables) and EXP-FIN-05 (Receivables) exports -- /finance/payables and
// /finance/receivables.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn, ExportSheet } from "@cofounderai/core/exports/types";
import { AGING_BUCKETS, AGING_BUCKET_LABELS, type AgingBucket, type AgingSummary } from "../lib/accounting/aging";
import type { OpenPayable, SupplierAging } from "../lib/accounting/payables";
import type { OpenReceivable, PartyAging } from "../lib/accounting/receivables";
import { PAYMENT_STATUS_LABEL } from "./labels";
import { getPayablesForExport, getReceivablesForExport } from "./queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

type OpenItem = OpenPayable | OpenReceivable;
type PartyRow = SupplierAging | PartyAging;

function openItemColumns(partyHeader: string, currency: string): ExportColumn<OpenItem>[] {
  return [
    { key: "party", header: partyHeader, getValue: (i) => i.partyName },
    { key: "document", header: "Document", getValue: (i) => i.number },
    { key: "date", header: "Document date", type: "date", getValue: (i) => i.docDate },
    { key: "due", header: "Due date", type: "date", getValue: (i) => i.dueDate },
    money("total", "Total", (i: OpenItem) => i.total, currency),
    money("credited", "Credited", (i: OpenItem) => i.credited, currency),
    money("paid", "Paid", (i: OpenItem) => i.paid, currency),
    money("outstanding", "Outstanding", (i: OpenItem) => i.outstanding, currency),
    { key: "aging", header: "Aging", getValue: (i) => AGING_BUCKET_LABELS[i.bucket] },
    { key: "status", header: "Status", getValue: (i) => PAYMENT_STATUS_LABEL[i.status] ?? i.status },
  ];
}

function byPartySheet(sheetName: string, partyHeader: string, rows: PartyRow[], currency: string): ExportSheet<PartyRow> {
  return {
    sheetName,
    rows,
    columns: [
      { key: "party", header: partyHeader, getValue: (p) => p.partyName },
      ...AGING_BUCKETS.map((bucket: AgingBucket) =>
        money(`bucket_${bucket}`, AGING_BUCKET_LABELS[bucket], (p: PartyRow) => p.buckets[bucket], currency),
      ),
      money("total", "Total outstanding", (p: PartyRow) => p.total, currency),
      { key: "count", header: "Open documents", type: "integer", getValue: (p) => p.count },
    ],
  };
}

type SummaryRow = { label: string; amount: number };

function agingSummarySheet(summary: AgingSummary, currency: string): ExportSheet<SummaryRow> {
  const rows: SummaryRow[] = [
    ...AGING_BUCKETS.map((bucket) => ({ label: AGING_BUCKET_LABELS[bucket], amount: summary.buckets[bucket] })),
    { label: "Overdue", amount: summary.overdue },
    { label: "Total outstanding", amount: summary.totalOutstanding },
  ];
  return {
    sheetName: "Aging summary",
    rows,
    columns: [
      { key: "bucket", header: "Aging", getValue: (r) => r.label },
      money("amount", "Outstanding", (r: SummaryRow) => r.amount, currency),
    ],
  };
}

/** Both pages show the whole open ledger with no filters or pagination; the export is
 * the same ledger, paged past PostgREST's 1,000-row cap. The pages read with no
 * permission check (`gst.journal.create` only enables paying). */
export const financePayablesExport: ExportAdapter<Record<string, never>> = {
  id: "finance.payables",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [ledger, currency] = await Promise.all([
      getPayablesForExport(context.businessId),
      getLedgerCurrency(context.businessId),
    ]);
    return {
      module: FINANCE_FILE_MODULE,
      resource: "payables",
      title: "Payables",
      metadata: { Currency: currency, "Aged as of": new Date().toISOString().slice(0, 10) },
      sheets: [
        { sheetName: "Open bills", rows: ledger.items, columns: openItemColumns("Supplier", currency) },
        byPartySheet("By supplier", "Supplier", ledger.bySupplier, currency),
        agingSummarySheet(ledger.summary, currency),
      ],
    };
  },
};

export const financeReceivablesExport: ExportAdapter<Record<string, never>> = {
  id: "finance.receivables",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [ledger, currency] = await Promise.all([
      getReceivablesForExport(context.businessId),
      getLedgerCurrency(context.businessId),
    ]);
    return {
      module: FINANCE_FILE_MODULE,
      resource: "receivables",
      title: "Receivables",
      metadata: { Currency: currency, "Aged as of": new Date().toISOString().slice(0, 10) },
      sheets: [
        { sheetName: "Open invoices", rows: ledger.items, columns: openItemColumns("Customer", currency) },
        byPartySheet("By customer", "Customer", ledger.byParty, currency),
        agingSummarySheet(ledger.summary, currency),
      ],
    };
  },
};
