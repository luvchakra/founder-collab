/**
 * Mirrors `inventory.stock_levels` -- a real inventory-schema table (SP-3a/SP-3b), not a
 * compat view, so it's `business_id`-keyed like `warehouses` rather than `org_id`-keyed
 * like `products`/`customers`/`suppliers`. Denormalized `item_name`/`item_sku`/
 * `reorder_point`/`warehouse_name`/`incoming` are joined in `queries.ts`, not by the
 * database -- this codebase deliberately avoids PostgREST embeds across compat views
 * (see products/queries.ts's own plain-query + JS-join precedent), and `incoming` isn't
 * a stored column at all (derived from open purchase orders, see queries.ts).
 */
export type StockLevel = {
  id: string;
  business_id: string;
  item_id: string;
  warehouse_id: string;
  quantity: number;
  reserved: number;
  damaged: number;
  expired: number;
  in_transit: number;
  updated_at: string;
  item_name: string;
  item_sku: string | null;
  reorder_point: number;
  warehouse_name: string;
  incoming: number;
};

/** Ported from stockpilot-ai-ops's inventory.tsx MOVEMENT_TYPES -- matches
 * `inventory.movement_type`'s full enum. */
export const MOVEMENT_TYPES: { value: string; label: string }[] = [
  { value: "inbound", label: "Inbound (receive stock)" },
  { value: "outbound", label: "Outbound (sale/dispatch)" },
  { value: "adjustment", label: "Adjustment (correction)" },
  { value: "reserve", label: "Reserve (hold for an order)" },
  { value: "unreserve", label: "Unreserve (release hold)" },
  { value: "damage", label: "Damage (flag as damaged)" },
  { value: "expired", label: "Expired" },
  { value: "return", label: "Return" },
];

export type LookupOption = { id: string; name: string; sku?: string | null };
