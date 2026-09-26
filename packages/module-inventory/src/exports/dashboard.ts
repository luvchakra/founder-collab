// EXP-INV-01 -- Inventory Dashboard export: the dashboard's numbers and lists, for the
// selected warehouse, with stock value only for users who may see cost.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { getDashboardSummary } from "../lib/dashboard/queries";
import type {
  DashboardAlert,
  DashboardInTransitTransfer,
  DashboardLowStockItem,
  DashboardMovementDay,
  DashboardOverduePurchaseOrder,
  DashboardWarehouseUnits,
} from "../lib/dashboard/types";
import { listWarehouses } from "../lib/warehouses/queries";
import { INVENTORY_EXPORT_PERMISSIONS, canViewCost, humanize, metricSheet, type MetricRow } from "./shared";

type Filters = { warehouse: string };

/**
 * `?warehouse=` is the page's one filter and is applied the same way: a warehouse that
 * isn't this business's is treated as no filter, exactly as the page treats it. The
 * page's own `getDashboardSummary()` produces every figure, so the file always matches
 * the screen; it already slices stock figures to the warehouse and leaves purchasing,
 * sales and GST business-wide (they have no warehouse dimension).
 */
export const inventoryDashboardExport: ExportAdapter<Filters> = {
  id: "inventory.dashboard",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: (params) => ({ warehouse: params.get("warehouse") ?? "" }),
  describeFilters: (f) => ({ Warehouse: f.warehouse ? "Selected warehouse" : "" }),
  async load(context, filters) {
    const businessId = context.businessId;
    const [costVisible, warehouses] = await Promise.all([canViewCost(businessId), listWarehouses(businessId)]);
    const warehouseNameById = new Map(warehouses.map((w) => [w.id, w.name]));
    const warehouseId = filters.warehouse && warehouseNameById.has(filters.warehouse) ? filters.warehouse : undefined;
    const data = await getDashboardSummary(businessId, costVisible, warehouseId, warehouseNameById);

    const summary: MetricRow[] = [
      { metric: "Products", quantity: data.productCount },
      ...(costVisible ? [{ metric: "Stock value (at cost)", amount: data.stockValue }] : []),
      { metric: "Units on hand", quantity: data.units },
      { metric: "Reserved", quantity: data.reserved },
      { metric: "Incoming (open purchase orders)", quantity: data.incoming },
      { metric: "Available", quantity: data.available },
      { metric: "Healthy products", quantity: data.healthy },
      { metric: "Low stock products", quantity: data.low },
      { metric: "Out of stock products", quantity: data.stockout },
      { metric: "Open alerts (latest)", quantity: data.alerts.length, note: "The dashboard lists the five most recent" },
    ];
    const sales: MetricRow[] = [
      { metric: "Sales today", amount: data.salesTodayTotal },
      { metric: "CGST collected this month", amount: data.cgstCollectedThisMonth },
      { metric: "SGST collected this month", amount: data.sgstCollectedThisMonth },
      { metric: "IGST collected this month", amount: data.igstCollectedThisMonth },
      { metric: "GST collected this month", amount: data.gstCollectedThisMonth },
    ];
    const purchasing: MetricRow[] = [
      { metric: "Open purchase orders", quantity: data.pendingPurchases },
      { metric: "Overdue purchase orders", quantity: data.overduePOs.length },
      { metric: "Purchases without a valid supplier GSTIN this month", quantity: data.gstRiskCount },
      { metric: "CGST paid this month", amount: data.cgstThisMonth },
      { metric: "SGST paid this month", amount: data.sgstThisMonth },
      { metric: "IGST paid this month", amount: data.igstThisMonth },
      { metric: "GST paid this month", amount: data.gstPayableThisMonth },
    ];

    const stockByWarehouse: ExportSheet<DashboardWarehouseUnits> = {
      sheetName: "Stock",
      columns: [
        { key: "warehouse", header: "Warehouse", getValue: (r) => r.name },
        { key: "units", header: "Units on hand", type: "number", getValue: (r) => r.units },
      ],
      rows: data.byWarehouse,
    };
    const lowStock: ExportSheet<DashboardLowStockItem> = {
      sheetName: "Low Stock",
      columns: [
        { key: "sku", header: "SKU", getValue: (r) => r.sku ?? "" },
        { key: "product", header: "Product", getValue: (r) => r.name },
        { key: "reorder_point", header: "Reorder point", type: "number", getValue: (r) => r.reorder_point },
      ],
      rows: data.lowStock,
    };
    const overdue: ExportSheet<DashboardOverduePurchaseOrder> = {
      sheetName: "Overdue Purchase Orders",
      columns: [
        { key: "po", header: "PO number", getValue: (r) => r.po_number },
        { key: "supplier", header: "Supplier", getValue: (r) => r.supplier_name },
      ],
      rows: data.overduePOs,
    };
    const inTransit: ExportSheet<DashboardInTransitTransfer> = {
      sheetName: "In-transit Transfers",
      columns: [
        { key: "transfer", header: "Transfer number", getValue: (r) => r.transfer_number },
        { key: "from", header: "Source warehouse", getValue: (r) => r.source_warehouse_name },
        { key: "to", header: "Destination warehouse", getValue: (r) => r.destination_warehouse_name },
      ],
      rows: data.inTransitTransfers,
    };
    const alerts: ExportSheet<DashboardAlert> = {
      sheetName: "Open Alerts",
      columns: [
        { key: "title", header: "Alert", getValue: (r) => r.title },
        { key: "severity", header: "Severity", getValue: (r) => humanize(r.severity) },
      ],
      rows: data.alerts,
    };
    const movement: ExportSheet<DashboardMovementDay> = {
      sheetName: "Movement Trend",
      columns: [
        { key: "day", header: "Date", type: "date", getValue: (r) => r.day },
        { key: "increase", header: "Units in", type: "number", getValue: (r) => r.increase },
        { key: "decrease", header: "Units out", type: "number", getValue: (r) => r.decrease },
      ],
      rows: data.movementTrend,
    };

    return {
      module: "inventory",
      resource: "dashboard",
      title: "Inventory dashboard",
      metadata: { Warehouse: warehouseId ? (warehouseNameById.get(warehouseId) ?? "") : "All warehouses" },
      sheets: [
        metricSheet("Summary", summary),
        stockByWarehouse,
        lowStock,
        metricSheet("Sales", sales),
        metricSheet("Purchasing", purchasing),
        overdue,
        inTransit,
        alerts,
        movement,
      ],
    };
  },
};
