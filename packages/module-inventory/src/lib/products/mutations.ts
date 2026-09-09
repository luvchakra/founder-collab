import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";

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

/** Ported from stockpilot-ai-ops's `saveProduct` mutation's category resolution. Exported
 * for `createProductsBulk`, which resolves one category per row the same way. */
export async function resolveCategoryId(
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
/** `requireModule()` (defense in depth, CLAUDE.md's licensing architecture section) --
 * this module's demonstrated call site, the entry point for the module's own core
 * catalogue entity. RLS still rejects the insert regardless if this somehow passed
 * incorrectly; this only turns that into a clearer message first. */
export async function createProduct(businessId: string, input: ProductInput): Promise<void> {
  await requireModule(businessId, "inventory");
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

/**
 * Bulk-creates products from a parsed CSV paste (see `../products/csv.ts`), one insert
 * call for the whole batch -- same shape as module-discovery's `createProspectsBulk`.
 * Category names are resolved (find-or-create) per row before the insert since
 * PostgREST can't resolve a free-text name inline; duplicate category names across rows
 * safely resolve to the same id via `resolveCategoryId`'s own find-then-create lookup.
 */
export async function createProductsBulk(businessId: string, inputs: ProductInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const supabase = await createClient();

  const rows = [];
  for (const input of inputs) {
    const categoryId = await resolveCategoryId(supabase, businessId, input.categoryName);
    rows.push({ org_id: businessId, ...payloadFrom(input, categoryId) });
  }

  const { data, error } = await supabase.from("products").insert(rows).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/**
 * Generates a barcode for every given product that doesn't already have one, encoding
 * its SKU (never overwrites an existing barcode -- matches stockpilot-ai-ops's own
 * BarcodeLabelDialog behavior, so re-generating a label never changes a code that's
 * already printed and out on a shelf or box). Returns how many rows were actually
 * updated -- products that already had a barcode are silently skipped, not an error.
 */
export async function generateBarcodesForProducts(productIds: string[]): Promise<number> {
  if (productIds.length === 0) return 0;
  const supabase = await createClient();

  const { data: products, error: fetchError } = await supabase
    .from("products")
    .select("id, sku, barcode")
    .in("id", productIds);
  if (fetchError) throw fetchError;

  const toUpdate = (products ?? []).filter((p) => !p.barcode);
  for (const p of toUpdate) {
    const { error } = await supabase.from("products").update({ barcode: p.sku }).eq("id", p.id);
    if (error) throw error;
  }
  return toUpdate.length;
}
