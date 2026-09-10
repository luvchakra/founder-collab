import type { ProductProfile } from "../ai/schemas";

export type Account = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type AccountRole = "owner" | "admin" | "member";

export type Business = {
  id: string;
  account_id: string;
  name: string;
  description: string | null;
  website: string | null;
  industry: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
};

export type Product = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  website: string | null;
  status: "active" | "archived";
  /** core.items row this product mirrors to/from (supabase/migrations/
   * 20260910090000_discovery_products_inventory_item_link.sql) -- null until Inventory
   * is licensed and the mirror succeeds, or for a product created before this existed. */
  linked_item_id: string | null;
  product_profile: ProductProfile | null;
  product_profile_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Workspace = {
  id: string;
  product_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

/** Shared by every rename action (business, product) and the EditableName component
 * that submits to them. */
export type RenameActionState = { error: string } | { success: true } | null;
