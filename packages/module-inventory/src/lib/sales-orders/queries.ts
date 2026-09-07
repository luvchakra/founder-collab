import { cache } from "react";
import { createClient } from "../../db/server";
import type { CustomerOption, LookupOption, ProductOption, SalesOrder, SalesOrderItem } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/sales-orders.tsx `salesOrders`
 * useQuery, joined with customer/warehouse names in JS (see stock/queries.ts's own
 * precedent for why -- no PostgREST embed across these compat views). */
export const listSalesOrders = cache(async (businessId: string): Promise<SalesOrder[]> => {
  const supabase = await createClient();
  const [soRes, customersRes, warehousesRes] = await Promise.all([
    supabase.from("sales_orders").select("*").eq("org_id", businessId).order("created_at", { ascending: false }),
    supabase.from("customers").select("id, name").eq("org_id", businessId),
    supabase.from("warehouses").select("id, name").eq("business_id", businessId),
  ]);
  if (soRes.error) throw soRes.error;
  if (customersRes.error) throw customersRes.error;
  if (warehousesRes.error) throw warehousesRes.error;

  const customerById = new Map(customersRes.data.map((c) => [c.id, c.name]));
  const warehouseById = new Map(warehousesRes.data.map((w) => [w.id, w.name]));
  return soRes.data.map((so) => ({
    ...so,
    customer_name: customerById.get(so.customer_id) ?? "Unknown customer",
    warehouse_name: warehouseById.get(so.warehouse_id) ?? "Unknown warehouse",
  }));
});

export const listSalesOrderItems = cache(async (salesOrderId: string): Promise<SalesOrderItem[]> => {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("sales_order_items")
    .select("*")
    .eq("sales_order_id", salesOrderId)
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

export const listActiveCustomerOptions = cache(async (businessId: string): Promise<CustomerOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, state, gstin")
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

export const listActiveProductOptions = cache(async (businessId: string): Promise<ProductOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, sku, selling_price, tax_rate")
    .eq("org_id", businessId)
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data;
});
