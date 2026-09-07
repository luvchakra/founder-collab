import { cache } from "react";
import { createClient } from "../../db/server";
import type { LookupOption, StockLevel } from "./types";

// A PO's ordered-but-not-yet-received quantity counts as "incoming" once it's a
// confirmed order the supplier is acting on, not while it's still a draft or awaiting
// approval -- matches stockpilot-ai-ops's own INCOMING_PO_STATUSES exactly.
const INCOMING_PO_STATUSES = new Set(["approved", "sent", "partially_received"]);

function incomingKey(itemId: string, warehouseId: string) {
  return `${itemId}:${warehouseId}`;
}

/** Ported from stockpilot-ai-ops's routes/_authenticated/inventory.tsx `stockLevels`/
 * `products`/`warehouses`/`incomingByKey` useQuerys, joined here in JS rather than via
 * a PostgREST embed -- this codebase's compat views carry no real foreign keys between
 * them for PostgREST to embed across (see products/queries.ts's own precedent). */
export const listStockLevels = cache(async (businessId: string): Promise<StockLevel[]> => {
  const supabase = await createClient();
  const [levelsRes, itemsRes, warehousesRes, incomingRes] = await Promise.all([
    supabase
      .from("stock_levels")
      .select("*")
      .eq("business_id", businessId)
      .order("updated_at", { ascending: false }),
    supabase.from("products").select("id, name, sku, reorder_point").eq("org_id", businessId),
    supabase.from("warehouses").select("id, name").eq("business_id", businessId),
    supabase
      .from("purchase_order_items")
      .select("purchase_order_id, product_id, quantity, received_quantity")
      .eq("org_id", businessId),
  ]);
  if (levelsRes.error) throw levelsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  if (warehousesRes.error) throw warehousesRes.error;
  if (incomingRes.error) throw incomingRes.error;

  const poIds = [...new Set(incomingRes.data.map((i) => i.purchase_order_id))];
  const posRes = poIds.length
    ? await supabase.from("purchase_orders").select("id, status, warehouse_id").in("id", poIds)
    : { data: [], error: null };
  if (posRes.error) throw posRes.error;
  const poById = new Map(posRes.data.map((po) => [po.id, po]));

  const incomingByKey = new Map<string, number>();
  for (const item of incomingRes.data) {
    const po = poById.get(item.purchase_order_id);
    if (!po || !INCOMING_PO_STATUSES.has(po.status)) continue;
    const outstanding = Number(item.quantity) - Number(item.received_quantity);
    if (outstanding <= 0) continue;
    const key = incomingKey(item.product_id, po.warehouse_id);
    incomingByKey.set(key, (incomingByKey.get(key) ?? 0) + outstanding);
  }

  const itemById = new Map(itemsRes.data.map((i) => [i.id, i]));
  const warehouseById = new Map(warehousesRes.data.map((w) => [w.id, w]));

  return levelsRes.data.map((level) => {
    const item = itemById.get(level.item_id);
    const warehouse = warehouseById.get(level.warehouse_id);
    return {
      ...level,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? null,
      reorder_point: item?.reorder_point ?? 0,
      warehouse_name: warehouse?.name ?? "Unknown warehouse",
      incoming: incomingByKey.get(incomingKey(level.item_id, level.warehouse_id)) ?? 0,
    };
  });
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
