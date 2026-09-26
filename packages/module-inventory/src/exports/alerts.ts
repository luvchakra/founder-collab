// EXP-INV-11 -- Inventory alerts export (/inventory/alerts).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listAlertsForExport, type AlertForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, humanize } from "./shared";

/** Every alert the page lists, with the product and warehouse of the stock level a
 * low-stock alert points at (blank for alerts about anything else). */
export const inventoryAlertsExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.alerts",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const alerts = await listAlertsForExport(context.businessId);
    return {
      module: "inventory",
      resource: "alerts",
      title: "Inventory alerts",
      sheets: [
        {
          sheetName: "Alerts",
          columns: [
            { key: "type", header: "Alert type", getValue: (a: AlertForExport) => humanize(a.type) },
            { key: "title", header: "Alert", getValue: (a: AlertForExport) => a.title },
            { key: "product", header: "Product", getValue: (a: AlertForExport) => a.product_name ?? "" },
            { key: "warehouse", header: "Warehouse", getValue: (a: AlertForExport) => a.warehouse_name ?? "" },
            { key: "severity", header: "Severity", getValue: (a: AlertForExport) => humanize(a.severity) },
            { key: "status", header: "Status", getValue: (a: AlertForExport) => humanize(a.status) },
            { key: "created", header: "Created", type: "datetime", getValue: (a: AlertForExport) => a.created_at },
            { key: "resolved", header: "Resolved at", type: "datetime", getValue: (a: AlertForExport) => a.resolved_at },
            { key: "resolution", header: "Resolution", getValue: (a: AlertForExport) => a.resolution ?? "" },
            { key: "recommended", header: "Recommended action", getValue: (a: AlertForExport) => a.recommended_action ?? "" },
          ],
          rows: alerts,
        },
      ],
    };
  },
};
