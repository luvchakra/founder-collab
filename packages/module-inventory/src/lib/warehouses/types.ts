/**
 * Mirrors `inventory.warehouses` as actually built (SP-3a's
 * `20260906110000_inventory_schema.sql` + SP-3b's `20260906111000_inventory_procedural_
 * layer.sql`, which `alter table`s in `postal_code`/`contact_name`/`contact_phone` --
 * easy to miss reading SP-3a alone, confirmed instead against the live dev project via
 * Supabase MCP `list_tables`). Column-identical to stockpilot-ai-ops's original
 * `warehouses` table except `org_id` -> `business_id` (SP-3a's own deliberate rename,
 * matching CLAUDE.md's "business_id is the operational tenant for inventory", ADR-4).
 */
export type Warehouse = {
  id: string;
  business_id: string;
  name: string;
  code: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  postal_code: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
