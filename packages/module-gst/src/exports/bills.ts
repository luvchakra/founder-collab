// EXP-FIN-03 -- Bills and Expenses export (/finance/bills, /finance/expenses).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { BillKind } from "../lib/accounting/bills";
import { PAYMENT_STATUS_LABEL } from "./labels";
import { listBillsForExport, POSTING_STATE_LABEL, roundMoney, type BillExportRow } from "./queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS, getLedgerCurrency, money } from "./shared";

/**
 * The pages list `listBills(businessId, kind)`, which stops at the 200 most recent
 * documents; neither page paginates or filters, so the export is every bill (or every
 * expense) through `listBillsForExport` -- the same predicates, paged -- with the tax
 * split and posting state the list has no room for.
 */
function billsExport(kind: BillKind): ExportAdapter<Record<string, never>> {
  const isExpense = kind === "expense";
  return {
    id: isExpense ? "finance.expenses" : "finance.bills",
    module: FINANCE_LICENCE,
    // The page reads with no permission check; `gst.journal.create` only gates entry.
    permissions: FINANCE_READ_PERMISSIONS,
    parseFilters: () => ({}),
    async load(context) {
      const [rows, currency] = await Promise.all([
        listBillsForExport(context.businessId, kind),
        getLedgerCurrency(context.businessId),
      ]);
      return {
        module: FINANCE_FILE_MODULE,
        resource: isExpense ? "expenses" : "bills",
        title: isExpense ? "Expenses" : "Bills",
        metadata: { Currency: currency },
        sheets: [
          {
            sheetName: isExpense ? "Expenses" : "Bills",
            rows,
            columns: [
              { key: "number", header: "Document number", getValue: (b: BillExportRow) => b.number },
              { key: "party", header: isExpense ? "Paid to" : "Supplier", getValue: (b: BillExportRow) => b.partyName },
              { key: "date", header: "Date", type: "date", getValue: (b: BillExportRow) => b.docDate },
              { key: "due", header: "Due date", type: "date", getValue: (b: BillExportRow) => b.dueDate },
              money("taxable", "Taxable value", (b: BillExportRow) => b.taxableValue, currency),
              money("cgst", "CGST", (b: BillExportRow) => b.cgst, currency),
              money("sgst", "SGST", (b: BillExportRow) => b.sgst, currency),
              money("igst", "IGST", (b: BillExportRow) => b.igst, currency),
              money("gst", "GST total", (b: BillExportRow) => roundMoney(b.cgst + b.sgst + b.igst), currency),
              money("total", "Total", (b: BillExportRow) => b.total, currency),
              money("paid", "Paid", (b: BillExportRow) => b.paid, currency),
              money("outstanding", "Outstanding", (b: BillExportRow) => b.outstanding, currency),
              { key: "payment", header: "Payment status", getValue: (b: BillExportRow) => PAYMENT_STATUS_LABEL[b.status] ?? b.status },
              { key: "posting", header: "Posting status", getValue: (b: BillExportRow) => POSTING_STATE_LABEL[b.postingState] },
              {
                key: "gst_split",
                header: "GST split incomplete",
                type: "boolean",
                getValue: (b: BillExportRow) => b.gstSplitIncomplete,
              },
            ],
          },
        ],
      };
    },
  };
}

export const financeBillsExport = billsExport("bill");
export const financeExpensesExport = billsExport("expense");
