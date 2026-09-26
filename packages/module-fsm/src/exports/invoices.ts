// EXP-FSM-05 -- Service invoices export: every invoice on /[businessSlug]/service/invoices.
//
// The page's Unpaid/All toggle is client-side state, not a URL filter, so the export
// carries every invoice with its status -- filter "Status" to get the Unpaid view. Tax is
// written both as its GST components and as a total.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { InvoiceListItem } from "../lib/invoices/types";
import { INVOICE_STATUS_LABEL, labelFor } from "./labels";
import { listInvoicesForExport } from "./queries";

const money = { type: "currency", currency: "INR" } as const;

export const fsmInvoicesExport: ExportAdapter<Record<string, never>> = {
  id: "fsm.invoices",
  module: "fsm",
  // The invoices page checks no permission of its own -- the fsm licence (checked by the
  // runner) and business membership (RLS) are what reading it takes, balances included.
  permissions: [],
  parseFilters: () => ({}),
  async load(context) {
    const invoices = await listInvoicesForExport(context.businessId);
    return {
      module: "fsm",
      resource: "invoices",
      title: "Service invoices",
      sheets: [
        {
          sheetName: "Invoices",
          columns: [
            { key: "number", header: "Invoice #", getValue: (i: InvoiceListItem) => i.number },
            { key: "customer", header: "Customer", getValue: (i: InvoiceListItem) => i.party_name },
            { key: "job", header: "Job #", getValue: (i: InvoiceListItem) => i.job_number },
            { key: "date", header: "Invoice date", type: "date", getValue: (i: InvoiceListItem) => i.doc_date },
            { key: "due", header: "Due date", type: "date", getValue: (i: InvoiceListItem) => i.due_date },
            { key: "subtotal", header: "Subtotal", ...money, getValue: (i: InvoiceListItem) => i.subtotal },
            { key: "discount", header: "Discount", ...money, getValue: (i: InvoiceListItem) => i.discount_amount },
            { key: "shipping", header: "Shipping", ...money, getValue: (i: InvoiceListItem) => i.shipping_amount },
            { key: "cgst", header: "CGST", ...money, getValue: (i: InvoiceListItem) => i.cgst_amount },
            { key: "sgst", header: "SGST", ...money, getValue: (i: InvoiceListItem) => i.sgst_amount },
            { key: "igst", header: "IGST", ...money, getValue: (i: InvoiceListItem) => i.igst_amount },
            { key: "tax", header: "Tax", ...money, getValue: (i: InvoiceListItem) => Math.round((i.cgst_amount + i.sgst_amount + i.igst_amount) * 100) / 100 },
            { key: "total", header: "Total", ...money, getValue: (i: InvoiceListItem) => i.total_amount },
            { key: "balance", header: "Balance", ...money, getValue: (i: InvoiceListItem) => i.balance_amount },
            { key: "status", header: "Payment status", getValue: (i: InvoiceListItem) => labelFor(INVOICE_STATUS_LABEL, i.status) },
            { key: "created", header: "Created", type: "datetime", getValue: (i: InvoiceListItem) => i.created_at },
          ],
          rows: invoices,
        },
      ],
    };
  },
};
