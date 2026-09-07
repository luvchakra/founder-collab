import { cache } from "react";
import { createClient } from "../../db/server";
import type { LookupOption, Product } from "./types";

/**
 * Ported from stockpilot-ai-ops's routes/_authenticated/products.tsx `products`
 * useQuery. The original read `products_safe` (a column-masking view that nulled
 * `cost_price` for roles without `inventory.view_cost`, enforced at the database level)
 * -- that view doesn't exist in this platform's compat layer (SP-4 built row-level
 * compat views, not this column-level one), so the same masking is done here instead,
 * server-side, before the data ever reaches a Client Component's props.
 */
export const listProducts = cache(async (businessId: string, canViewCost: boolean): Promise<Product[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (canViewCost) return data;
  return data.map((p) => ({ ...p, cost_price: null }));
});

export const listCategoryOptions = cache(async (businessId: string): Promise<LookupOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id, name").eq("org_id", businessId);
  if (error) throw error;
  return data;
});

/** Active suppliers only -- matches the original's own lookup query exactly (a product
 * referencing an inactive supplier shows no supplier name, same as upstream). */
export const listActiveSupplierOptions = cache(async (businessId: string): Promise<LookupOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("org_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data;
});
