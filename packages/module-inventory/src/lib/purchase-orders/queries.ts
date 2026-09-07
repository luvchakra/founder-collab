import { cache } from "react";
import { createClient } from "../../db/server";
import type { LookupOption, ProductOption, PurchaseOrder, PurchaseOrderItem, SupplierOption } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/purchase-orders.tsx
 * `purchaseOrders` useQuery, joined with supplier/warehouse names in JS (no PostgREST
 * embed across these compat views -- see stock/queries.ts's own precedent). */
export const listPurchaseOrders = cache(async (businessId: string): Promise<PurchaseOrder[]> => {
  const supabase = await createClient();
  const [poRes, suppliersRes, warehousesRes] = await Promise.all([
    supabase.from("purchase_orders").select("*").eq("org_id", businessId).order("created_at", { ascending: false }),
    supabase.from("suppliers").select("id, name").eq("org_id", businessId),
    supabase.from("warehouses").select("id, name").eq("business_id", businessId),
  ]);
  if (poRes.error) throw poRes.error;
  if (suppliersRes.error) throw suppliersRes.error;
  if (warehousesRes.error) throw warehousesRes.error;

  const supplierById = new Map(suppliersRes.data.map((s) => [s.id, s.name]));
  const warehouseById = new Map(warehousesRes.data.map((w) => [w.id, w.name]));
  return poRes.data.map((po) => ({
    ...po,
    supplier_name: supplierById.get(po.supplier_id) ?? "Unknown supplier",
    warehouse_name: warehouseById.get(po.warehouse_id) ?? "Unknown warehouse",
  }));
});

export const listPurchaseOrderItems = cache(async (purchaseOrderId: string): Promise<PurchaseOrderItem[]> => {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("purchase_order_items")
    .select("*")
    .eq("purchase_order_id", purchaseOrderId)
    .order("created_at");
  if (error) throw error;
  if (items.length === 0) return [];

  const productIds = [...new Set(items.map((i) => i.product_id))];
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, sku")
    .in("id", productIds);
  if (productsError) throw productsError;
  const productById = new Map(products.map((p) => [p.id, p]));

  return items.map((i) => ({
    ...i,
    item_name: productById.get(i.product_id)?.name ?? "Unknown item",
    item_sku: productById.get(i.product_id)?.sku ?? null,
  }));
});

export const listActiveSupplierOptions = cache(async (businessId: string): Promise<SupplierOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, state, gst_number")
    .eq("org_id", businessId)
    .eq("is_active", true)
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

/** `canViewCost` mirrors products/queries.ts's own `listProducts` masking -- a role
 * without `inventory.view_cost` never receives real cost_price over the wire, even
 * though only `purchase_orders.edit` holders ever open this form (defense in depth for
 * whenever that permission split changes). */
export const listActiveProductOptions = cache(async (businessId: string, canViewCost: boolean): Promise<ProductOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, cost_price, tax_rate")
    .eq("org_id", businessId)
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  if (canViewCost) return data;
  return data.map((p) => ({ ...p, cost_price: null }));
});
