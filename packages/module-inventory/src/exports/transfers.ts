// EXP-INV-10 -- Stock transfers export (/inventory/transfers).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { STAGES, type StockTransfer } from "../lib/stock-transfers/types";
import { listStockTransfersForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, stageLabel } from "./shared";

type TransferRow = StockTransfer & { requested: number; received: number; damaged: number };

/** Every transfer the page lists, with its lines' requested / received / damaged
 * quantities and each stage's date. Shipped quantity is the requested quantity once a
 * transfer has a shipped date (transfers ship whole). */
export const inventoryTransfersExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.transfers",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const { transfers, lines } = await listStockTransfersForExport(context.businessId);
    const totals = new Map<string, { requested: number; received: number; damaged: number }>();
    for (const line of lines) {
      const t = totals.get(line.stock_transfer_id) ?? { requested: 0, received: 0, damaged: 0 };
      t.requested += Number(line.quantity);
      t.received += Number(line.received_quantity);
      t.damaged += Number(line.damaged_quantity);
      totals.set(line.stock_transfer_id, t);
    }
    const rows: TransferRow[] = transfers.map((t) => ({ ...t, requested: 0, received: 0, damaged: 0, ...totals.get(t.id) }));

    return {
      module: "inventory",
      resource: "transfers",
      title: "Inventory stock transfers",
      sheets: [
        {
          sheetName: "Stock Transfers",
          columns: [
            { key: "number", header: "Transfer number", getValue: (t: TransferRow) => t.transfer_number },
            { key: "source", header: "Source warehouse", getValue: (t: TransferRow) => t.source_warehouse_name },
            { key: "destination", header: "Destination warehouse", getValue: (t: TransferRow) => t.destination_warehouse_name },
            { key: "status", header: "Status", getValue: (t: TransferRow) => stageLabel(STAGES, t.status) },
            { key: "requested", header: "Requested quantity", type: "number", getValue: (t: TransferRow) => t.requested },
            { key: "shipped", header: "Shipped quantity", type: "number", getValue: (t: TransferRow) => (t.shipped_at ? t.requested : null) },
            { key: "received", header: "Received quantity", type: "number", getValue: (t: TransferRow) => (t.received_at ? t.received : null) },
            { key: "damaged", header: "Damaged quantity", type: "number", getValue: (t: TransferRow) => (t.received_at ? t.damaged : null) },
            { key: "requested_at", header: "Requested at", type: "datetime", getValue: (t: TransferRow) => t.created_at },
            { key: "shipped_at", header: "Shipped at", type: "datetime", getValue: (t: TransferRow) => t.shipped_at },
            { key: "received_at", header: "Received at", type: "datetime", getValue: (t: TransferRow) => t.received_at },
            { key: "completed_at", header: "Completed at", type: "datetime", getValue: (t: TransferRow) => t.completed_at },
            { key: "cancelled_at", header: "Cancelled at", type: "datetime", getValue: (t: TransferRow) => t.cancelled_at },
          ],
          rows,
        },
      ],
    };
  },
};
