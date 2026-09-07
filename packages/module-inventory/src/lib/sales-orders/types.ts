/**
 * Mirrors `inventory.sales_orders`/`inventory.sales_order_items` -- compat views (SP-4)
 * over `core.documents`/`core.document_lines`, `org_id`-keyed like `products`/
 * `customers`.
 */
export type SalesOrderStatus =
  | "draft"
  | "confirmed"
  | "processing"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export type SalesOrder = {
  id: string;
  org_id: string;
  customer_id: string;
  warehouse_id: string;
  so_number: string;
  status: SalesOrderStatus;
  order_date: string;
  expected_fulfillment_date: string | null;
  notes: string | null;
  subtotal: number;
  discount_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  shipping_amount: number;
  total_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  customer_name: string;
  warehouse_name: string;
};

export type SalesOrderItem = {
  id: string;
  org_id: string;
  sales_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  created_at: string;
  item_name: string;
  item_sku: string | null;
};

export type LookupOption = { id: string; name: string };
export type CustomerOption = { id: string; name: string; state: string | null; gstin: string | null };
export type ProductOption = { id: string; name: string; sku: string | null; selling_price: number; tax_rate: number };

export const STAGES: { key: SalesOrderStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

export type PrimaryAction =
  | { label: string; kind: "confirm" }
  | { label: string; kind: "ship" }
  | { label: string; kind: "status"; next: SalesOrderStatus };

export function primaryAction(status: SalesOrderStatus): PrimaryAction | null {
  switch (status) {
    case "draft":
      return { label: "Confirm order", kind: "confirm" };
    case "confirmed":
      return { label: "Start processing", kind: "status", next: "processing" };
    case "processing":
      return { label: "Mark as packed", kind: "status", next: "packed" };
    case "packed":
      return { label: "Ship order", kind: "ship" };
    case "shipped":
      return { label: "Mark as delivered", kind: "status", next: "delivered" };
    default:
      return null;
  }
}

export const CANCELLABLE_STATUSES = new Set<SalesOrderStatus>(["draft", "confirmed", "processing", "packed"]);
