// EXP-INV-09 (Returns) -- Sales returns export (/inventory/sales-returns).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { REASON_LABEL, STAGES, type SalesReturn, type SalesReturnReason } from "../lib/sales-returns/types";
import { listSalesReturnsForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, humanize, money, stageLabel } from "./shared";

type ReturnRow = SalesReturn & { reasons: string; quantity: number; total: number | null };

/**
 * Every return the page lists. A return's reason and value live on its lines, so the
 * row carries the distinct line reasons (labelled) and the returned value at the
 * lines' selling prices -- blank, not zero, when a return has no lines yet.
 */
export const inventorySalesReturnsExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.sales-returns",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const { returns, lines } = await listSalesReturnsForExport(context.businessId);
    const byReturn = new Map<string, { reasons: Set<string>; quantity: number; total: number }>();
    for (const line of lines) {
      const agg = byReturn.get(line.sales_return_id) ?? { reasons: new Set<string>(), quantity: 0, total: 0 };
      agg.reasons.add(REASON_LABEL[line.reason as SalesReturnReason] ?? humanize(line.reason));
      agg.quantity += Number(line.quantity);
      agg.total += Number(line.quantity) * Number(line.unit_price);
      byReturn.set(line.sales_return_id, agg);
    }
    const rows: ReturnRow[] = returns.map((r) => {
      const agg = byReturn.get(r.id);
      return { ...r, reasons: agg ? [...agg.reasons].join("; ") : "", quantity: agg?.quantity ?? 0, total: agg ? agg.total : null };
    });

    return {
      module: "inventory",
      resource: "sales-returns",
      title: "Inventory sales returns",
      sheets: [
        {
          sheetName: "Returns",
          columns: [
            { key: "number", header: "Return number", getValue: (r: ReturnRow) => r.return_number },
            { key: "so", header: "Sales order", getValue: (r: ReturnRow) => r.so_number },
            { key: "customer", header: "Customer", getValue: (r: ReturnRow) => r.customer_name },
            { key: "date", header: "Return date", type: "date", getValue: (r: ReturnRow) => r.return_date },
            { key: "reason", header: "Reason", getValue: (r: ReturnRow) => r.reasons },
            { key: "status", header: "Status", getValue: (r: ReturnRow) => stageLabel(STAGES, r.status) },
            { key: "quantity", header: "Quantity returned", type: "number", getValue: (r: ReturnRow) => r.quantity },
            money<ReturnRow>("total", "Total", (r) => r.total),
            { key: "credit_note", header: "Credit note", getValue: (r: ReturnRow) => r.credit_note_number ?? "" },
            { key: "approved", header: "Approved at", type: "datetime", getValue: (r: ReturnRow) => r.approved_at },
            { key: "completed", header: "Completed at", type: "datetime", getValue: (r: ReturnRow) => r.completed_at },
            { key: "cancelled", header: "Cancelled at", type: "datetime", getValue: (r: ReturnRow) => r.cancelled_at },
          ],
          rows,
        },
      ],
    };
  },
};
