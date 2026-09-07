import { createClient } from "../db/server";
import type { Item, ItemCategory, ItemInventoryAttrs, ItemKind } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function createItemCategory(input: {
  businessId: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
}): Promise<ItemCategory> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("item_categories")
    .insert({
      business_id: input.businessId,
      name: input.name,
      description: input.description ?? null,
      parent_id: input.parentId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createItem(input: {
  businessId: string;
  kind?: ItemKind;
  sku?: string | null;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  supplierPartyId?: string | null;
  unit?: string;
  hsnCode?: string | null;
  taxRate?: number;
  costPrice?: number;
  sellingPrice?: number;
  imageUrl?: string | null;
}): Promise<Item> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("items")
    .insert({
      business_id: input.businessId,
      kind: input.kind ?? "good",
      sku: input.sku ?? null,
      name: input.name,
      description: input.description ?? null,
      category_id: input.categoryId ?? null,
      supplier_party_id: input.supplierPartyId ?? null,
      unit: input.unit ?? "pcs",
      hsn_code: input.hsnCode ?? null,
      tax_rate: input.taxRate ?? 18,
      cost_price: input.costPrice ?? 0,
      selling_price: input.sellingPrice ?? 0,
      image_url: input.imageUrl ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Only meaningful for a stocked (`kind='good'`) item -- a service/labour/expense item
 * has no inventory attrs row at all. */
export async function setItemInventoryAttrs(input: {
  businessId: string;
  itemId: string;
  reorderPoint?: number;
  reorderQuantity?: number;
  barcode?: string | null;
}): Promise<ItemInventoryAttrs> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("item_inventory_attrs")
    .upsert(
      {
        item_id: input.itemId,
        business_id: input.businessId,
        reorder_point: input.reorderPoint ?? 0,
        reorder_quantity: input.reorderQuantity ?? 0,
        barcode: input.barcode ?? null,
      },
      { onConflict: "item_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
