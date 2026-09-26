// EXP-INV-03 -- Inventory customers export (/inventory/customers).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { Customer } from "../lib/customers/types";
import { listCustomersForExport } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS } from "./shared";

/**
 * Every customer the page lists. The page shows no outstanding balance and this schema
 * keeps none per customer (core.document_aging mixes orders, invoices and other
 * document types), so the export carries no outstanding column rather than a guess.
 */
export const inventoryCustomersExport: ExportAdapter<Record<string, never>> = {
  id: "inventory.customers",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const customers = await listCustomersForExport(context.businessId);
    return {
      module: "inventory",
      resource: "customers",
      title: "Inventory customers",
      sheets: [
        {
          sheetName: "Customers",
          columns: [
            { key: "name", header: "Customer", getValue: (c: Customer) => c.name },
            { key: "phone", header: "Phone", getValue: (c: Customer) => c.phone ?? "" },
            { key: "email", header: "Email", getValue: (c: Customer) => c.email ?? "" },
            { key: "gstin", header: "GSTIN", getValue: (c: Customer) => c.gstin ?? "" },
            { key: "billing", header: "Billing address", getValue: (c: Customer) => c.billing_address ?? "" },
            { key: "shipping", header: "Shipping address", getValue: (c: Customer) => c.shipping_address ?? "" },
            { key: "state", header: "State", getValue: (c: Customer) => c.state ?? "" },
            { key: "active", header: "Active", type: "boolean", getValue: (c: Customer) => c.is_active },
            { key: "created", header: "Created", type: "datetime", getValue: (c: Customer) => c.created_at },
          ],
          rows: customers,
        },
      ],
    };
  },
};
