/**
 * Mirrors `inventory.products` -- a compat view (SP-4) over `core.items` +
 * `core.item_inventory_attrs`, joined via `INSTEAD OF` insert/update/delete triggers, so
 * it's queried exactly like stockpilot-ai-ops's original `products` table. Unlike the
 * inventory schema's own real tables (e.g. `warehouses`, which uses `business_id`), this
 * compat view deliberately keeps the original column name `org_id` -- confirmed against
 * the live dev project via Supabase MCP before writing this file, per CLAUDE.md's "live
 * source of truth" rule.
 */
export type Product = {
  id: string;
  org_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  supplier_id: string | null;
  unit: string;
  hsn_code: string | null;
  tax_rate: number;
  /** Null when the caller lacks `inventory.view_cost` -- masked server-side in
   * queries.ts before this ever reaches a Client Component, since this platform has no
   * `products_safe` column-masking view the way stockpilot-ai-ops did. */
  cost_price: number | null;
  selling_price: number;
  reorder_point: number;
  reorder_quantity: number;
  barcode: string | null;
  image_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  brand: string | null;
};

export type LookupOption = { id: string; name: string };
