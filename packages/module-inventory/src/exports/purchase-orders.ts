// EXP-INV-07 -- Purchase orders export (/inventory/purchase-orders), with a lines sheet.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";
import { STAGES, type PurchaseOrder, type PurchaseOrderItem } from "../lib/purchase-orders/types";
import { listPurchaseOrdersForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, canViewCost, money, num, percentFraction, stageLabel } from "./shared";

type OrderRow = PurchaseOrder & { ordered: number; received: number };
type LineRow = PurchaseOrderItem & { po_number: string };

/**
 * One row per purchase order (the page's list, which shows order totals to every
 * Inventory user) plus a `Purchase Order Lines` sheet. A line's unit cost -- and the
 * line value and tax derived from it -- is supplier cost, so those columns exist only
 * for users holding `inventory.view_cost`.
 */
export const inventoryPurchaseOrdersExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.purchase-orders",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const businessId = context.businessId;
    const [costVisible, { orders, lines }] = await Promise.all([canViewCost(businessId), listPurchaseOrdersForExport(businessId)]);

    const totals = new Map<string, { ordered: number; received: number }>();
    for (const line of lines) {
      const t = totals.get(line.purchase_order_id) ?? { ordered: 0, received: 0 };
      t.ordered += Number(line.quantity);
      t.received += Number(line.received_quantity);
      totals.set(line.purchase_order_id, t);
    }
    const orderRows: OrderRow[] = orders.map((po) => ({ ...po, ordered: totals.get(po.id)?.ordered ?? 0, received: totals.get(po.id)?.received ?? 0 }));
    const poNumberById = new Map(orders.map((po) => [po.id, po.po_number]));
    const lineRows: LineRow[] = lines.map((line) => ({ ...line, po_number: poNumberById.get(line.purchase_order_id) ?? "" }));

    const lineColumns: ExportColumn<LineRow>[] = [
      { key: "po", header: "PO number", getValue: (l) => l.po_number },
      { key: "sku", header: "SKU", getValue: (l) => l.item_sku ?? "" },
      { key: "product", header: "Product", getValue: (l) => l.item_name },
      { key: "quantity", header: "Ordered", type: "number", getValue: (l) => l.quantity },
      { key: "received", header: "Received", type: "number", getValue: (l) => l.received_quantity },
      { key: "outstanding", header: "Outstanding", type: "number", getValue: (l) => Math.max(0, Number(l.quantity) - Number(l.received_quantity)) },
      { key: "tax_rate", header: "Tax rate", type: "percent", getValue: (l) => percentFraction(l.tax_rate) },
      ...(costVisible
        ? [
            money<LineRow>("unit_cost", "Unit cost", (l) => l.unit_cost),
            money<LineRow>("line_value", "Line value (before tax)", (l) => {
              const cost = num(l.unit_cost);
              return cost === null ? null : cost * Number(l.quantity);
            }),
            money<LineRow>("cgst", "CGST", (l) => l.cgst_amount),
            money<LineRow>("sgst", "SGST", (l) => l.sgst_amount),
            money<LineRow>("igst", "IGST", (l) => l.igst_amount),
          ]
        : []),
    ];

    return {
      module: "inventory",
      resource: "purchase-orders",
      title: "Inventory purchase orders",
      sheets: [
        {
          sheetName: "Purchase Orders",
          columns: [
            { key: "po", header: "PO number", getValue: (o: OrderRow) => o.po_number },
            { key: "supplier", header: "Supplier", getValue: (o: OrderRow) => o.supplier_name },
            { key: "warehouse", header: "Warehouse", getValue: (o: OrderRow) => o.warehouse_name },
            { key: "status", header: "Status", getValue: (o: OrderRow) => stageLabel(STAGES, o.status) },
            { key: "order_date", header: "Order date", type: "date", getValue: (o: OrderRow) => o.order_date },
            { key: "expected", header: "Expected delivery", type: "date", getValue: (o: OrderRow) => o.expected_delivery_date },
            money<OrderRow>("subtotal", "Subtotal", (o) => o.subtotal),
            money<OrderRow>("tax", "Tax", (o) => o.tax_amount),
            money<OrderRow>("discount", "Discount", (o) => o.discount_amount),
            money<OrderRow>("shipping", "Shipping", (o) => o.shipping_amount),
            money<OrderRow>("total", "Total", (o) => o.total_amount),
            { key: "ordered", header: "Ordered quantity", type: "number", getValue: (o: OrderRow) => o.ordered },
            { key: "received", header: "Received quantity", type: "number", getValue: (o: OrderRow) => o.received },
            { key: "outstanding", header: "Outstanding quantity", type: "number", getValue: (o: OrderRow) => Math.max(0, o.ordered - o.received) },
          ],
          rows: orderRows,
        },
        { sheetName: "Purchase Order Lines", columns: lineColumns, rows: lineRows },
      ],
    };
  },
};
