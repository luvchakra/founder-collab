// EXP-INV-06 -- Stock levels export (/inventory/stock).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { StockLevel } from "../lib/stock/types";
import { listStockLevelsForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS } from "./shared";

/** The Stock page's own arithmetic: available = on hand - reserved - damaged - expired;
 * low when a reorder point is set and on hand is at or below it. */
export function reorderStatus(level: Pick<StockLevel, "quantity" | "reorder_point">): string {
  if (Number(level.quantity) <= 0) return "Out of stock";
  if (Number(level.reorder_point) > 0 && Number(level.quantity) <= Number(level.reorder_point)) return "Low stock";
  return "Healthy";
}

/**
 * One row per product per warehouse, every row (the page has no filters). Stock levels
 * carry no cost, so there is nothing to gate here. "Last movement" is when the level
 * last changed -- every stock movement updates it.
 */
export const inventoryStockExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.stock",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const levels = await listStockLevelsForExport(context.businessId);
    return {
      module: "inventory",
      resource: "stock",
      title: "Inventory stock levels",
      sheets: [
        {
          sheetName: "Stock",
          columns: [
            { key: "warehouse", header: "Warehouse", getValue: (l: StockLevel) => l.warehouse_name },
            { key: "sku", header: "SKU", getValue: (l: StockLevel) => l.item_sku ?? "" },
            { key: "product", header: "Product", getValue: (l: StockLevel) => l.item_name },
            { key: "quantity", header: "On hand", type: "number", getValue: (l: StockLevel) => l.quantity },
            { key: "reserved", header: "Reserved", type: "number", getValue: (l: StockLevel) => l.reserved },
            { key: "damaged", header: "Damaged", type: "number", getValue: (l: StockLevel) => l.damaged },
            { key: "expired", header: "Expired", type: "number", getValue: (l: StockLevel) => l.expired },
            {
              key: "available",
              header: "Available",
              type: "number",
              getValue: (l: StockLevel) => Number(l.quantity) - Number(l.reserved) - Number(l.damaged) - Number(l.expired),
            },
            { key: "incoming", header: "Incoming", type: "number", getValue: (l: StockLevel) => l.incoming },
            { key: "in_transit", header: "In transit", type: "number", getValue: (l: StockLevel) => l.in_transit },
            { key: "reorder_point", header: "Reorder point", type: "number", getValue: (l: StockLevel) => l.reorder_point },
            { key: "reorder_status", header: "Reorder status", getValue: (l: StockLevel) => reorderStatus(l) },
            { key: "last_movement", header: "Last movement", type: "datetime", getValue: (l: StockLevel) => l.updated_at },
          ],
          rows: levels,
        },
      ],
    };
  },
};
