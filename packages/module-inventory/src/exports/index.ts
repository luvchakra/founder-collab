import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { inventoryAlertsExport } from "./alerts";
import { inventoryAuditLogExport } from "./audit-log";
import { inventoryCustomersExport } from "./customers";
import { inventoryDashboardExport } from "./dashboard";
import { inventoryProductsExport } from "./products";
import { inventoryPurchaseOrdersExport } from "./purchase-orders";
import { inventorySalesInvoicesExport } from "./sales-invoices";
import { inventorySalesOrdersExport } from "./sales-orders";
import { inventorySalesReturnsExport } from "./sales-returns";
import { inventoryStockExport } from "./stock";
import { inventorySuppliersExport } from "./suppliers";
import { inventoryTransfersExport } from "./transfers";
import { inventoryWarehousesExport } from "./warehouses";

/**
 * Every Inventory export adapter (EXP-INV-01..12), registered by the host in
 * apps/web/lib/exports/registry.ts. See docs/design/data-exports.md for how an adapter is
 * written.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
export const INVENTORY_EXPORTS: ExportAdapter<any>[] = [
  inventoryDashboardExport, // EXP-INV-01
  inventoryProductsExport, // EXP-INV-02
  inventoryCustomersExport, // EXP-INV-03
  inventorySuppliersExport, // EXP-INV-04
  inventoryWarehousesExport, // EXP-INV-05
  inventoryStockExport, // EXP-INV-06
  inventoryPurchaseOrdersExport, // EXP-INV-07
  inventorySalesOrdersExport, // EXP-INV-08
  inventorySalesInvoicesExport, // EXP-INV-09
  inventorySalesReturnsExport, // EXP-INV-09
  inventoryTransfersExport, // EXP-INV-10
  inventoryAlertsExport, // EXP-INV-11
  inventoryAuditLogExport, // EXP-INV-12
];
