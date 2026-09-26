// EXP-INV-09 (Sales invoices) -- Sales invoices export (/inventory/sales-invoices).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { PAYMENT_STATUS_LABEL, type SalesInvoice } from "../lib/sales-invoices/types";
import { listSalesInvoicesForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, money } from "./shared";

/**
 * Every invoice the page lists. Invoices here carry no due date, so none is exported;
 * "Source" is the sales order the invoice was generated from. The taxable amount is
 * the invoice subtotal (what its credit-note form calls "taxable value").
 */
export const inventorySalesInvoicesExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.sales-invoices",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const invoices = await listSalesInvoicesForExport(context.businessId);
    return {
      module: "inventory",
      resource: "sales-invoices",
      title: "Inventory sales invoices",
      sheets: [
        {
          sheetName: "Sales Invoices",
          columns: [
            { key: "number", header: "Invoice number", getValue: (i: SalesInvoice) => i.invoice_number },
            { key: "customer", header: "Customer", getValue: (i: SalesInvoice) => i.customer_name },
            { key: "gstin", header: "Customer GSTIN", getValue: (i: SalesInvoice) => i.customer_gstin ?? "" },
            { key: "date", header: "Invoice date", type: "date", getValue: (i: SalesInvoice) => i.invoice_date },
            money<SalesInvoice>("taxable", "Taxable amount", (i) => i.subtotal),
            money<SalesInvoice>("discount", "Discount", (i) => i.discount_amount),
            money<SalesInvoice>("cgst", "CGST", (i) => i.cgst_amount),
            money<SalesInvoice>("sgst", "SGST", (i) => i.sgst_amount),
            money<SalesInvoice>("igst", "IGST", (i) => i.igst_amount),
            money<SalesInvoice>("gst", "GST", (i) => Number(i.cgst_amount) + Number(i.sgst_amount) + Number(i.igst_amount)),
            money<SalesInvoice>("shipping", "Shipping", (i) => i.shipping_amount),
            money<SalesInvoice>("total", "Total", (i) => i.total_amount),
            { key: "payment", header: "Payment status", getValue: (i: SalesInvoice) => PAYMENT_STATUS_LABEL[i.payment_status] ?? i.payment_status },
            { key: "source", header: "Source (sales order)", getValue: (i: SalesInvoice) => i.so_number },
          ],
          rows: invoices,
        },
      ],
    };
  },
};
