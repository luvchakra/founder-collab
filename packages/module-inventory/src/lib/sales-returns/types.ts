/**
 * Mirrors `inventory.sales_returns`/`inventory.sales_return_items` -- compat views
 * (SP-4) over `core.documents`/`core.document_lines` + `inventory.sales_return_lines_
 * stock` (restock/is_damaged/reason satellite), `org_id`-keyed like `products`/
 * `customers`.
 */
export type SalesReturnStatus = "draft" | "approved" | "completed" | "cancelled";
export type SalesReturnReason = "wrong_item" | "damaged" | "changed_mind" | "size_issue" | "quality_issue" | "other";

export const REASON_LABEL: Record<SalesReturnReason, string> = {
  wrong_item: "Wrong item",
  damaged: "Damaged",
  changed_mind: "Changed mind",
  size_issue: "Size issue",
  quality_issue: "Quality issue",
  other: "Other",
};
export const REASONS = Object.keys(REASON_LABEL) as SalesReturnReason[];

export type SalesReturn = {
  id: string;
  org_id: string;
  sales_order_id: string;
  sales_invoice_id: string | null;
  credit_note_id: string | null;
  return_number: string;
  status: SalesReturnStatus;
  return_date: string;
  notes: string | null;
  requested_by: string;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  so_number: string;
  customer_name: string;
  credit_note_number: string | null;
};

export type SalesReturnItem = {
  id: string;
  org_id: string;
  sales_return_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  reason: SalesReturnReason;
  restock: boolean;
  is_damaged: boolean;
  created_at: string;
  item_name: string;
  item_sku: string | null;
};

export type EligibleSalesOrder = { id: string; so_number: string; customer_name: string };
export type SoItemForReturn = { product_id: string; quantity: number; unit_price: number; item_name: string; item_sku: string | null };

export const STAGES: { key: SalesReturnStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Completed" },
];

export function primaryAction(status: SalesReturnStatus): { label: string; kind: "approve" } | { label: string; kind: "status"; next: SalesReturnStatus } | null {
  switch (status) {
    case "draft":
      return { label: "Approve return", kind: "approve" };
    case "approved":
      return { label: "Mark completed", kind: "status", next: "completed" };
    default:
      return null;
  }
}
