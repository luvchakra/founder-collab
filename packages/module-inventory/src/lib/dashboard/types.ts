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
};
