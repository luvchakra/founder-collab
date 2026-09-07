import { cache } from "react";
import { createClient } from "../../db/server";
import type { LookupOption, StockTransfer, StockTransferItem } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/stock-transfers.tsx
 * `transfers` useQuery, joined with warehouse names in JS (see stock/queries.ts's own
 * precedent for why -- no PostgREST embed across these tables). */
export const listStockTransfers = cache(async (businessId: string): Promise<StockTransfer[]> => {
  const supabase = await createClient();
  const [transfersRes, warehousesRes] = await Promise.all([
    supabase
      .from("stock_transfers")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false }),
    supabase.from("warehouses").select("id, name").eq("business_id", businessId),
  ]);
  if (transfersRes.error) throw transfersRes.error;
  if (warehousesRes.error) throw warehousesRes.error;

  const warehouseById = new Map(warehousesRes.data.map((w) => [w.id, w.name]));
  return transfersRes.data.map((t) => ({
    ...t,
    source_warehouse_name: warehouseById.get(t.source_warehouse_id) ?? "Unknown warehouse",
    destination_warehouse_name: warehouseById.get(t.destination_warehouse_id) ?? "Unknown warehouse",
  }));
});

export const listStockTransferItems = cache(async (transferId: string): Promise<StockTransferItem[]> => {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("stock_transfer_items")
    .select("*")
    .eq("stock_transfer_id", transferId)
    .order("created_at");
  if (error) throw error;
  if (items.length === 0) return [];

  const itemIds = [...new Set(items.map((i) => i.item_id))];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, sku")
    .in("id", itemIds);
  if (productsError) throw productsError;
  const productById = new Map(products.map((p) => [p.id, p]));

  return items.map((i) => ({
    ...i,
    item_name: productById.get(i.item_id)?.name ?? "Unknown item",
    item_sku: productById.get(i.item_id)?.sku ?? null,
  }));
});

export const listActiveWarehouseOptions = cache(async (businessId: string): Promise<LookupOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data;
});

export const listActiveProductOptions = cache(async (businessId: string): Promise<LookupOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku")
    .eq("org_id", businessId)
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data;
});
