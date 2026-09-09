/**
 * The result shape every contract/index.ts function returns instead of throwing for an
 * expected failure mode -- ADR-10 ("no hard dependencies between modules"): a caller not
 * licensed for `inventory` gets `{ ok: false, error: "MODULE_NOT_LICENSED" }` back as a
 * normal value to branch on, not an exception to catch. Only a genuinely unexpected
 * failure (a network error, a bug) still throws.
 */
export type ContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "MODULE_NOT_LICENSED" | "NOT_FOUND" | "INVALID_INPUT" | string };

export type ContractWarehouse = { id: string; name: string; code: string };

export type ContractAvailability = {
  warehouseId: string;
  quantity: number;
  reserved: number;
  available: number;
};

export type ContractLowStockAlert = {
  id: string;
  title: string;
  description: string | null;
  severity: "info" | "warning" | "critical";
  createdAt: string;
};

/** One row of a party's recent sales-order/invoice history -- what the Customer 360
 * panel (docs/design/crm-module-design.md Part B, B1) shows for "recent orders and
 * their status" without CRM needing to know inventory's own schema. */
export type ContractOrderSummary = {
  id: string;
  kind: "sales_order" | "invoice";
  number: string;
  status: string;
  totalAmount: number;
  orderDate: string;
};

export type UpsertItemInput = {
  /** Update this item by id when given; otherwise find-or-create by `sku` (when given),
   * else always insert a new row. */
  id?: string;
  sku?: string | null;
  name: string;
  kind?: "good" | "service" | "labour" | "part" | "expense";
  unit?: string;
  hsnCode?: string | null;
  taxRate?: number;
  costPrice?: number;
  sellingPrice?: number;
  /** Only meaningful for kind 'good' -- matches core.item_inventory_attrs' own scope
   * (products/queries.ts's own reorder_point/reorder_quantity/barcode fields). */
  reorderPoint?: number;
  reorderQuantity?: number;
  barcode?: string | null;
};
