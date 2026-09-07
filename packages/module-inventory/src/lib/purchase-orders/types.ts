/**
 * Mirrors `inventory.purchase_orders`/`inventory.purchase_order_items` -- compat views
 * (SP-4) over `core.documents`/`core.document_lines`, still `org_id`-keyed like
 * `products`/`suppliers` (not `business_id`, unlike the real tables `warehouses`/
 * `stock_transfers`).
 */
export type PurchaseOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "sent"
  | "partially_received"
  | "received"
  | "closed"
  | "cancelled";

export type PurchaseOrder = {
  id: string;
  org_id: string;
  supplier_id: string;
  warehouse_id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_delivery_date: string | null;
  notes: string | null;
  subtotal: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  discount_amount: number;
  shipping_amount: number;
  total_amount: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  supplier_name: string;
  warehouse_name: string;
};

export type PurchaseOrderItem = {
  id: string;
  org_id: string;
  purchase_order_id: string;
  product_id: string;
  quantity: number;
  received_quantity: number;
  unit_cost: number;
  tax_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  created_at: string;
  item_name: string;
  item_sku: string | null;
};

export type LookupOption = { id: string; name: string };
export type SupplierOption = { id: string; name: string; state: string | null; gst_number: string | null };
export type ProductOption = { id: string; name: string; sku: string | null; cost_price: number | null; tax_rate: number };

export const STAGES: { key: PurchaseOrderStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "approved", label: "Approved" },
  { key: "sent", label: "Sent" },
  { key: "received", label: "Received" },
  { key: "closed", label: "Closed" },
];

export function primaryAction(status: PurchaseOrderStatus): { label: string; next: PurchaseOrderStatus } | null {
  switch (status) {
    case "draft":
      return { label: "Approve", next: "approved" };
    case "approved":
      return { label: "Mark as sent", next: "sent" };
    case "received":
      return { label: "Close order", next: "closed" };
    default:
      return null;
  }
}
