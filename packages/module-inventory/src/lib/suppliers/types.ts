/**
 * Mirrors `inventory.suppliers` -- a compat view (SP-4) over `core.parties`, joined via
 * `INSTEAD OF` insert/update/delete triggers (confirmed via Supabase MCP before writing
 * this file, same as `products`), so it's queried exactly like stockpilot-ai-ops's
 * original `suppliers` table -- still exposes `org_id`, not `business_id`.
 */
export type Supplier = {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  gst_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  payment_terms: string | null;
  lead_time_days: number;
  min_order_quantity: number | null;
  rating: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
