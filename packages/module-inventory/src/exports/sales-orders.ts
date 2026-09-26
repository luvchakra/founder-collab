// EXP-INV-08 -- Sales orders export (/inventory/sales-orders), with a lines sheet.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { PAYMENT_STATUS_LABEL } from "../lib/sales-invoices/types";
import { STAGES, type SalesOrder, type SalesOrderItem } from "../lib/sales-orders/types";
import { listSalesOrdersForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, money, percentFraction, stageLabel } from "./shared";

type OrderRow = SalesOrder & { invoice_number: string; payment_status: string };
type LineRow = SalesOrderItem & { so_number: string };

/**
 * One row per sales order plus a `Sales Order Lines` sheet. The order's status is its
 * fulfilment stage (draft -> delivered), exactly the badge the page shows; payment
 * status is its invoice's, or "Not invoiced". Selling prices are not cost data.
 */
export const inventorySalesOrdersExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.sales-orders",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const { orders, lines, invoices } = await listSalesOrdersForExport(context.businessId);
    const invoiceBySo = new Map(invoices.map((inv) => [inv.sales_order_id, inv]));
    const orderRows: OrderRow[] = orders.map((so) => {
      const invoice = invoiceBySo.get(so.id);
      return {
        ...so,
        invoice_number: invoice?.invoice_number ?? "",
        payment_status: invoice ? (PAYMENT_STATUS_LABEL[invoice.payment_status] ?? invoice.payment_status) : "Not invoiced",
      };
    });
    const soNumberById = new Map(orders.map((so) => [so.id, so.so_number]));
    const lineRows: LineRow[] = lines.map((line) => ({ ...line, so_number: soNumberById.get(line.sales_order_id) ?? "" }));

    return {
      module: "inventory",
      resource: "sales-orders",
      title: "Inventory sales orders",
      sheets: [
        {
          sheetName: "Sales Orders",
          columns: [
            { key: "so", header: "Order number", getValue: (o: OrderRow) => o.so_number },
            { key: "customer", header: "Customer", getValue: (o: OrderRow) => o.customer_name },
            { key: "warehouse", header: "Warehouse", getValue: (o: OrderRow) => o.warehouse_name },
            { key: "status", header: "Fulfilment status", getValue: (o: OrderRow) => stageLabel(STAGES, o.status) },
            { key: "order_date", header: "Order date", type: "date", getValue: (o: OrderRow) => o.order_date },
            { key: "expected", header: "Expected fulfilment", type: "date", getValue: (o: OrderRow) => o.expected_fulfillment_date },
            money<OrderRow>("subtotal", "Subtotal", (o) => o.subtotal),
            money<OrderRow>("discount", "Discount", (o) => o.discount_amount),
            money<OrderRow>("gst", "GST", (o) => Number(o.cgst_amount) + Number(o.sgst_amount) + Number(o.igst_amount)),
            money<OrderRow>("shipping", "Shipping", (o) => o.shipping_amount),
            money<OrderRow>("total", "Total", (o) => o.total_amount),
            { key: "invoice", header: "Invoice", getValue: (o: OrderRow) => o.invoice_number },
            { key: "payment", header: "Payment status", getValue: (o: OrderRow) => o.payment_status },
          ],
          rows: orderRows,
        },
        {
          sheetName: "Sales Order Lines",
          columns: [
            { key: "so", header: "Order number", getValue: (l: LineRow) => l.so_number },
            { key: "sku", header: "SKU", getValue: (l: LineRow) => l.item_sku ?? "" },
            { key: "product", header: "Product", getValue: (l: LineRow) => l.item_name },
            { key: "quantity", header: "Quantity", type: "number", getValue: (l: LineRow) => l.quantity },
            money<LineRow>("unit_price", "Unit price", (l) => l.unit_price),
            { key: "tax_rate", header: "Tax rate", type: "percent", getValue: (l: LineRow) => percentFraction(l.tax_rate) },
            money<LineRow>("gst", "GST", (l) => Number(l.cgst_amount) + Number(l.sgst_amount) + Number(l.igst_amount)),
          ],
          rows: lineRows,
        },
      ],
    };
  },
};
