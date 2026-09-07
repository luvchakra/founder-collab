import { cache } from "react";
import { createClient } from "../../db/server";
import type { EligibleSalesOrder, SalesReturn, SalesReturnItem, SoItemForReturn } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/sales-returns.tsx `returns`
 * useQuery, joined with SO/customer/credit-note data in JS (see stock/queries.ts's own
 * precedent for why -- no PostgREST embed across these compat views). */
export const listSalesReturns = cache(async (businessId: string): Promise<SalesReturn[]> => {
  const supabase = await createClient();
  const [returnsRes, salesOrdersRes, customersRes, creditNotesRes] = await Promise.all([
    supabase.from("sales_returns").select("*").eq("org_id", businessId).order("created_at", { ascending: false }),
    supabase.from("sales_orders").select("id, so_number, customer_id").eq("org_id", businessId),
    supabase.from("customers").select("id, name").eq("org_id", businessId),
    supabase.from("credit_notes").select("id, credit_note_number").eq("org_id", businessId),
  ]);
  if (returnsRes.error) throw returnsRes.error;
  if (salesOrdersRes.error) throw salesOrdersRes.error;
  if (customersRes.error) throw customersRes.error;
  if (creditNotesRes.error) throw creditNotesRes.error;

  const soById = new Map(salesOrdersRes.data.map((so) => [so.id, so]));
  const customerById = new Map(customersRes.data.map((c) => [c.id, c.name]));
  const creditNoteById = new Map(creditNotesRes.data.map((cn) => [cn.id, cn.credit_note_number]));

  return returnsRes.data.map((r) => {
    const so = soById.get(r.sales_order_id);
    return {
      ...r,
      so_number: so?.so_number ?? "Unknown order",
      customer_name: so ? customerById.get(so.customer_id) ?? "Unknown customer" : "Unknown customer",
      credit_note_number: r.credit_note_id ? creditNoteById.get(r.credit_note_id) ?? null : null,
    };
  });
});

export const listSalesReturnItems = cache(async (salesReturnId: string): Promise<SalesReturnItem[]> => {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("sales_return_items")
    .select("*")
    .eq("sales_return_id", salesReturnId)
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

/** Shipped/delivered sales orders -- matches the original's own eligibleSos filter. */
export const listEligibleSalesOrders = cache(async (businessId: string): Promise<EligibleSalesOrder[]> => {
  const supabase = await createClient();
  const [soRes, customersRes] = await Promise.all([
    supabase
      .from("sales_orders")
      .select("id, so_number, customer_id")
      .eq("org_id", businessId)
      .in("status", ["shipped", "delivered"])
      .order("order_date", { ascending: false }),
    supabase.from("customers").select("id, name").eq("org_id", businessId),
  ]);
  if (soRes.error) throw soRes.error;
  if (customersRes.error) throw customersRes.error;
  const customerById = new Map(customersRes.data.map((c) => [c.id, c.name]));
  return soRes.data.map((so) => ({
    id: so.id,
    so_number: so.so_number,
    customer_name: customerById.get(so.customer_id) ?? "Unknown customer",
  }));
});

/** The selected sales order's own line items, used to pre-fill a new return's draft
 * lines (capped later at approval time against what's already been returned). */
export const listSalesOrderItemsForReturn = cache(async (salesOrderId: string): Promise<SoItemForReturn[]> => {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("sales_order_items")
    .select("product_id, quantity, unit_price")
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
