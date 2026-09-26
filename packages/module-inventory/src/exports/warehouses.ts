// EXP-INV-05 -- Warehouses export (/inventory/warehouses).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listWarehouses } from "../lib/warehouses/queries";
import type { Warehouse } from "../lib/warehouses/types";
import { INVENTORY_EXPORT_PERMISSIONS, humanize } from "./shared";

/** The page's own `listWarehouses()` -- a business has a handful of warehouses, never
 * near PostgREST's row cap. No capacity is stored, so none is exported. */
export const inventoryWarehousesExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.warehouses",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const warehouses = await listWarehouses(context.businessId);
    return {
      module: "inventory",
      resource: "warehouses",
      title: "Inventory warehouses",
      sheets: [
        {
          sheetName: "Warehouses",
          columns: [
            { key: "name", header: "Warehouse", getValue: (w: Warehouse) => w.name },
            { key: "code", header: "Code", getValue: (w: Warehouse) => w.code },
            { key: "type", header: "Type", getValue: (w: Warehouse) => humanize(w.type) },
            { key: "address", header: "Address", getValue: (w: Warehouse) => w.address ?? "" },
            { key: "city", header: "City", getValue: (w: Warehouse) => w.city ?? "" },
            { key: "state", header: "State", getValue: (w: Warehouse) => w.state ?? "" },
            { key: "postal_code", header: "Postal code", getValue: (w: Warehouse) => w.postal_code ?? "" },
            { key: "country", header: "Country", getValue: (w: Warehouse) => w.country },
            { key: "contact", header: "Contact", getValue: (w: Warehouse) => w.contact_name ?? "" },
            { key: "contact_phone", header: "Contact phone", getValue: (w: Warehouse) => w.contact_phone ?? "" },
            { key: "active", header: "Active", type: "boolean", getValue: (w: Warehouse) => w.is_active },
          ],
          rows: warehouses,
        },
      ],
    };
  },
};
