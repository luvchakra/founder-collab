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

/** INT-02.2's "Create Inventory Fulfillment/Reservation Request" -- the minimal
 * context a fulfillment request needs, matching the epic's own "transfer only necessary
 * context" list (party, product references, quantities, required date, notes). No
 * warehouse -- resolved server-side (the caller's own business may have exactly one
 * active warehouse and shouldn't need to know that), same "no fulfillment location
 * concept assumed on the caller's side" degradation the epic's own acceptance criteria
 * ask for ("use only states/fields the existing Inventory domain supports"). */
export type CreateFulfillmentRequestInput = {
  partyId: string;
  lineItems: { itemId: string; quantity: number }[];
  requiredDate?: string | null;
  notes?: string | null;
};

/** INT-02.3's "Inventory Commitment State" projection -- `status` is the sales order's
 * own real value (`draft`/`confirmed`/`shipped`/`delivered`/`cancelled`, whatever
 * `inventory.sales_orders` actually supports; this contract never invents a state that
 * table doesn't have). */
export type FulfillmentStatus = {
  fulfillmentRequestId: string;
  status: string;
  totalAmount: number;
  warehouseId: string | null;
  updatedAt: string;
};

export type UpsertItemInput = {
  /** Update this item by id when given; otherwise find-or-create by `sku` (when given),
   * else always insert a new row. */
  id?: string;
  sku?: string | null;
  name: string;
  description?: string | null;
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
