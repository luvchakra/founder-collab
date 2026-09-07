import { cache } from "react";
import { createClient } from "../../db/server";
import type { CreditNote, EligibleSalesOrder, SalesInvoice, SalesInvoiceItem } from "./types";
import { INVOICEABLE_SO_STATUSES } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/sales-invoices.tsx `invoices`
 * useQuery, joined with customer/SO names in JS (see stock/queries.ts's own precedent
 * for why -- no PostgREST embed across these compat views). */
export const listSalesInvoices = cache(async (businessId: string): Promise<SalesInvoice[]> => {
  const supabase = await createClient();
  const [invoicesRes, customersRes, salesOrdersRes] = await Promise.all([
    supabase.from("sales_invoices").select("*").eq("org_id", businessId).order("created_at", { ascending: false }),
    supabase.from("customers").select("id, name").eq("org_id", businessId),
    supabase.from("sales_orders").select("id, so_number").eq("org_id", businessId),
  ]);
  if (invoicesRes.error) throw invoicesRes.error;
  if (customersRes.error) throw customersRes.error;
  if (salesOrdersRes.error) throw salesOrdersRes.error;

  const customerById = new Map(customersRes.data.map((c) => [c.id, c.name]));
  const soById = new Map(salesOrdersRes.data.map((so) => [so.id, so.so_number]));
  return invoicesRes.data.map((inv) => ({
    ...inv,
    customer_name: customerById.get(inv.customer_id) ?? "Unknown customer",
    so_number: soById.get(inv.sales_order_id) ?? "Unknown order",
  }));
});

/** Confirmed/shipped sales orders that don't have an invoice yet -- matches the
 * original's own eligibleSos filter (INVOICEABLE_SO_STATUSES minus already-invoiced). */
export const listEligibleSalesOrders = cache(async (businessId: string): Promise<EligibleSalesOrder[]> => {
  const supabase = await createClient();
  const [soRes, invoicesRes, customersRes] = await Promise.all([
    supabase.from("sales_orders").select("id, so_number, status, customer_id").eq("org_id", businessId).order("created_at", { ascending: false }),
    supabase.from("sales_invoices").select("sales_order_id").eq("org_id", businessId),
    supabase.from("customers").select("id, name").eq("org_id", businessId),
  ]);
  if (soRes.error) throw soRes.error;
  if (invoicesRes.error) throw invoicesRes.error;
  if (customersRes.error) throw customersRes.error;

  const invoicedSoIds = new Set(invoicesRes.data.map((inv) => inv.sales_order_id));
  const customerById = new Map(customersRes.data.map((c) => [c.id, c.name]));
  return soRes.data
    .filter((so) => INVOICEABLE_SO_STATUSES.has(so.status) && !invoicedSoIds.has(so.id))
    .map((so) => ({
      id: so.id,
      so_number: so.so_number,
      status: so.status,
      customer_name: customerById.get(so.customer_id) ?? "Unknown customer",
    }));
});

export const listSalesInvoiceItems = cache(async (invoiceId: string): Promise<SalesInvoiceItem[]> => {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("sales_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
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

export const listCreditNotes = cache(async (invoiceId: string): Promise<CreditNote[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_notes")
    .select("*")
    .eq("sales_invoice_id", invoiceId)
    .order("created_at");
  if (error) throw error;
  return data;
});
