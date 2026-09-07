import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";

export type ProductInput = {
  sku: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  description?: string | null;
  /** Free-text category name -- resolved (find-or-create) to a category_id, same as the
   * original's inline "type a category name" field. */
  categoryName?: string | null;
  supplier_id?: string | null;
  unit: string;
  hsn_code?: string | null;
  tax_rate: number;
  cost_price: number;
  selling_price: number;
  reorder_point: number;
  reorder_quantity: number;
};

/** Ported from stockpilot-ai-ops's `saveProduct` mutation's category resolution. */
async function resolveCategoryId(
  supabase: SupabaseClient,
  businessId: string,
  categoryName: string | null | undefined,
): Promise<string | null> {
  const name = categoryName?.trim();
  if (!name) return null;

  const { data: existing, error: findError } = await supabase
    .from("categories")
    .select("id")
    .eq("org_id", businessId)
    .ilike("name", name)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("categories")
    .insert({ org_id: businessId, name })
    .select("id")
    .single();
  if (createError) throw createError;
  return created.id;
}

function payloadFrom(input: ProductInput, categoryId: string | null) {
  return {
    sku: input.sku,
    name: input.name,
    brand: input.brand || null,
    barcode: input.barcode || null,
    description: input.description || null,
    category_id: categoryId,
    supplier_id: input.supplier_id || null,
    unit: input.unit,
    hsn_code: input.hsn_code || null,
    tax_rate: input.tax_rate,
    cost_price: input.cost_price,
    selling_price: input.selling_price,
    reorder_point: input.reorder_point,
    reorder_quantity: input.reorder_quantity,
  };
}

/** Ported from stockpilot-ai-ops's `saveProduct` mutation -- create branch. */
export async function createProduct(businessId: string, input: ProductInput): Promise<void> {
  const supabase = await createClient();
  const categoryId = await resolveCategoryId(supabase, businessId, input.categoryName);
  const { error } = await supabase
    .from("products")
    .insert({ org_id: businessId, ...payloadFrom(input, categoryId) });
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `saveProduct` mutation -- update branch. */
export async function updateProduct(
  businessId: string,
  productId: string,
  input: ProductInput,
): Promise<void> {
  const supabase = await createClient();
  const categoryId = await resolveCategoryId(supabase, businessId, input.categoryName);
  const { error } = await supabase
    .from("products")
    .update(payloadFrom(input, categoryId))
    .eq("id", productId);
  if (error) throw error;
}

/** Ported from stockpilot-ai-ops's `toggleStatus` mutation. */
export async function setProductStatus(productId: string, status: "active" | "inactive"): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("products").update({ status }).eq("id", productId);
  if (error) throw error;
}
