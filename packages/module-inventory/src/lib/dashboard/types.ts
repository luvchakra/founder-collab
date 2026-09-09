/** Ported from stockpilot-ai-ops's routes/_authenticated/dashboard.tsx `summary`
 * useQuery's return shape -- one aggregate read model for the whole operations
 * dashboard, computed server-side here instead of client-side (no react-query in this
 * codebase's Server Component pages). */
export type DashboardLowStockItem = { id: string; name: string; sku: string | null; reorder_point: number };
export type DashboardOverduePurchaseOrder = { id: string; po_number: string; supplier_name: string };
export type DashboardInTransitTransfer = {
  id: string;
  transfer_number: string;
  source_warehouse_name: string;
  destination_warehouse_name: string;
};
export type DashboardAlert = { id: string; title: string; severity: string };
export type DashboardMovementDay = { day: string; label: number; increase: number; decrease: number };
export type DashboardWarehouseUnits = { id: string; name: string; units: number };

export type DashboardSummary = {
  productCount: number;
  /** Null when the caller lacks `inventory.view_cost` -- masked the same way
   * products/queries.ts's own listProducts already masks cost_price. */
  stockValue: number | null;
  units: number;
  reserved: number;
  incoming: number;
  available: number;
  healthy: number;
  low: number;
  stockout: number;
  lowStock: DashboardLowStockItem[];
  pendingPurchases: number;
  overduePOs: DashboardOverduePurchaseOrder[];
  inTransitTransfers: DashboardInTransitTransfer[];
  alerts: DashboardAlert[];
  movementTrend: DashboardMovementDay[];
  gstRiskCount: number;
  cgstThisMonth: number;
  sgstThisMonth: number;
  igstThisMonth: number;
  gstPayableThisMonth: number;
  cgstCollectedThisMonth: number;
  sgstCollectedThisMonth: number;
  igstCollectedThisMonth: number;
  gstCollectedThisMonth: number;
  salesTodayTotal: number;
  hasGstin: boolean;
  /** Units on hand per warehouse, across the whole business regardless of the
   * dashboard's own warehouse filter -- feeds the multi-warehouse comparison chart,
   * which only makes sense as an all-warehouses view. Empty when the business has
   * only ever had a single warehouse (a comparison of one bar isn't a comparison). */
  byWarehouse: DashboardWarehouseUnits[];
};
