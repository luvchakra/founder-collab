/**
 * Mirrors `inventory.stock_transfers`/`inventory.stock_transfer_items` -- real
 * inventory-schema tables (SP-3a/SP-3b), `business_id`-keyed like `warehouses`.
 */
export type StockTransferStatus =
  | "draft"
  | "requested"
  | "approved"
  | "in_transit"
  | "received"
  | "completed"
  | "cancelled";

export type StockTransfer = {
  id: string;
  business_id: string;
  transfer_number: string;
  source_warehouse_id: string;
  destination_warehouse_id: string;
  status: StockTransferStatus;
  notes: string | null;
  requested_by: string;
  approved_by: string | null;
  shipped_at: string | null;
  received_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  source_warehouse_name: string;
  destination_warehouse_name: string;
};

export type StockTransferItem = {
  id: string;
  business_id: string;
  stock_transfer_id: string;
  item_id: string;
  quantity: number;
  received_quantity: number;
  damaged_quantity: number;
  created_at: string;
  item_name: string;
  item_sku: string | null;
};

export type LookupOption = { id: string; name: string; sku?: string | null };

export const STAGES: { key: StockTransferStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "requested", label: "Requested" },
  { key: "approved", label: "Approved" },
  { key: "in_transit", label: "In Transit" },
  { key: "received", label: "Received" },
  { key: "completed", label: "Completed" },
];

export function primaryAction(
  status: StockTransferStatus,
): { label: string; kind: "status"; next: StockTransferStatus } | { label: string; kind: "ship" } | null {
  switch (status) {
    case "draft":
      return { label: "Submit for approval", kind: "status", next: "requested" };
    case "requested":
      return { label: "Approve", kind: "status", next: "approved" };
    case "approved":
      return { label: "Mark in transit", kind: "ship" };
    case "received":
      return { label: "Complete", kind: "status", next: "completed" };
    default:
      return null;
  }
}

export const CANCELLABLE_STATUSES = new Set<StockTransferStatus>(["draft", "requested", "approved", "in_transit"]);
