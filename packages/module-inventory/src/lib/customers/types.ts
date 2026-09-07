/**
 * Mirrors `inventory.customers` -- a compat view (SP-4) over `core.parties`, joined via
 * `INSTEAD OF` insert/update/delete triggers (confirmed via Supabase MCP before writing
 * this file, same as `products`/`suppliers`), so it's queried exactly like
 * stockpilot-ai-ops's original `customers` table -- still exposes `org_id`, not
 * `business_id`. Column-identical to stockpilot-ai-ops's original this time (no
 * discrepancy the way warehouses had one).
 */
export type Customer = {
  id: string;
  org_id: string;
  name: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  state: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
