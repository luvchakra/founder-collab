// EXP-INV-04 -- Suppliers export (/inventory/suppliers).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { Supplier } from "../lib/suppliers/types";
import { listSuppliersForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS } from "./shared";

/** Every supplier the page lists. No outstanding balance is stored per supplier, so
 * none is exported. */
export const inventorySuppliersExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.suppliers",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const suppliers = await listSuppliersForExport(context.businessId);
    return {
      module: "inventory",
      resource: "suppliers",
      title: "Inventory suppliers",
      sheets: [
        {
          sheetName: "Suppliers",
          columns: [
            { key: "name", header: "Supplier", getValue: (s: Supplier) => s.name },
            { key: "code", header: "Code", getValue: (s: Supplier) => s.code ?? "" },
            { key: "contact", header: "Contact person", getValue: (s: Supplier) => s.contact_person ?? "" },
            { key: "email", header: "Email", getValue: (s: Supplier) => s.email ?? "" },
            { key: "phone", header: "Phone", getValue: (s: Supplier) => s.phone ?? "" },
            { key: "gstin", header: "GSTIN", getValue: (s: Supplier) => s.gst_number ?? "" },
            { key: "address", header: "Address", getValue: (s: Supplier) => s.address ?? "" },
            { key: "city", header: "City", getValue: (s: Supplier) => s.city ?? "" },
            { key: "state", header: "State", getValue: (s: Supplier) => s.state ?? "" },
            { key: "payment_terms", header: "Payment terms", getValue: (s: Supplier) => s.payment_terms ?? "" },
            { key: "lead_time", header: "Lead time (days)", type: "integer", getValue: (s: Supplier) => s.lead_time_days },
            { key: "moq", header: "Minimum order quantity", type: "number", getValue: (s: Supplier) => s.min_order_quantity },
            { key: "rating", header: "Rating", type: "number", getValue: (s: Supplier) => s.rating },
            { key: "active", header: "Active", type: "boolean", getValue: (s: Supplier) => s.is_active },
          ],
          rows: suppliers,
        },
      ],
    };
  },
};
