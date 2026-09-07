import { createClient } from "../db/server";
import type { Item, ItemCategory, ItemInventoryAttrs, TaxRate } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function listItemCategoriesForBusiness(businessId: string): Promise<ItemCategory[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("item_categories")
    .select("*")
    .eq("business_id", businessId);
  if (error) throw error;
  return data;
}

export async function listItemsForBusiness(businessId: string): Promise<Item[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("items").select("*").eq("business_id", businessId);
  if (error) throw error;
  return data;
}

export async function getItem(itemId: string): Promise<Item | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getItemInventoryAttrs(itemId: string): Promise<ItemInventoryAttrs | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("item_inventory_attrs")
    .select("*")
    .eq("item_id", itemId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The standard GST slabs -- readable by any authenticated user, not tenant-scoped. */
export async function listTaxRates(): Promise<TaxRate[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("tax_rates").select("*").order("rate");
  if (error) throw error;
  return data;
}
