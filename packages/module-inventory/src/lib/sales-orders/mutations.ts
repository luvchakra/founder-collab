import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { aggregateGst, computeLineGst, resolveStateCode } from "@cofounderai/core/lib/gst";

export type LineItemInput = { product_id: string; quantity: number; unit_price: number; tax_rate: number };

export type SalesOrderInput = {
  customer_id: string;
  warehouse_id: string;
  expected_fulfillment_date?: string | null;
  notes?: string | null;
  discount_amount?: number;
  shipping_amount?: number;
  lines: LineItemInput[];
};

/** Computes each line's CGST/SGST/IGST server-side (never trusting client-computed tax
 * amounts for a financial document) -- see purchase-orders/mutations.ts's own
 * computeTotals docstring for the full reasoning; identical shape, seller/buyer swapped
 * (the business is the seller on a sales order, the buyer on a purchase order). */
async function computeTotals(
  businessId: string,
  customerId: string,
  lines: LineItemInput[],
  discountAmount: number,
  shippingAmount: number,
) {
  const supabase = await createClient();
  const core = await createCoreClient({ schema: "core" });

  const [{ data: settings }, { data: customer, error: customerError }] = await Promise.all([
    core.from("business_settings").select("gstin, state").eq("business_id", businessId).maybeSingle(),
    supabase.from("customers").select("state, gstin").eq("id", customerId).single(),
  ]);
  if (customerError) throw customerError;

  const sellerStateCode = resolveStateCode(settings?.state ?? null, settings?.gstin ?? null);
  const buyerStateCode = resolveStateCode(customer?.state ?? null, customer?.gstin ?? null);

  const breakups = lines.map((l) =>
    computeLineGst({
      taxableValue: l.quantity * l.unit_price,
      gstRatePercent: l.tax_rate,
      sellerStateCode,
      buyerStateCode,
    }),
  );
  const totals = aggregateGst(breakups);
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
  const total = subtotal + totals.totalTax + shippingAmount - discountAmount;

  return { breakups, subtotal, totals, total };
}

/** Ported from stockpilot-ai-ops's `saveSo` mutation -- create branch. Returns the
 * created order's id (INT-02.2's own need: the contract's `createFulfillmentRequest()`
 * hands this straight back as the one reference CRM stores) -- the original caller
 * (the Sales Orders page's own create action) simply doesn't use it. */
export async function createSalesOrder(businessId: string, input: SalesOrderInput): Promise<{ id: string }> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const discountAmount = input.discount_amount ?? 0;
  const shippingAmount = input.shipping_amount ?? 0;
  const { breakups, subtotal, totals, total } = await computeTotals(
    businessId,
    input.customer_id,
    input.lines,
    discountAmount,
    shippingAmount,
  );

  const { data: so, error } = await supabase
    .from("sales_orders")
    .insert({
      org_id: businessId,
      customer_id: input.customer_id,
      warehouse_id: input.warehouse_id,
      expected_fulfillment_date: input.expected_fulfillment_date || null,
      notes: input.notes || null,
      subtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      discount_amount: discountAmount,
      shipping_amount: shippingAmount,
      total_amount: total,
    })
    .select()
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("sales_order_items").insert(
    input.lines.map((l, i) => ({
      org_id: businessId,
      sales_order_id: so.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      cgst_amount: breakups[i]!.cgstAmount,
      sgst_amount: breakups[i]!.sgstAmount,
      igst_amount: breakups[i]!.igstAmount,
    })),
  );
  if (itemsError) throw itemsError;

  return { id: so.id };
}

/** Ported from stockpilot-ai-ops's `saveSo` mutation -- update branch. Draft-only edit,
 * so nothing has been reserved against these items yet -- safe to replace the whole set
 * rather than diff it. */
export async function updateSalesOrder(businessId: string, salesOrderId: string, input: SalesOrderInput): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const discountAmount = input.discount_amount ?? 0;
  const shippingAmount = input.shipping_amount ?? 0;
  const { breakups, subtotal, totals, total } = await computeTotals(
    businessId,
    input.customer_id,
    input.lines,
    discountAmount,
    shippingAmount,
  );

  const { error } = await supabase
    .from("sales_orders")
    .update({
      customer_id: input.customer_id,
      warehouse_id: input.warehouse_id,
      expected_fulfillment_date: input.expected_fulfillment_date || null,
      notes: input.notes || null,
      subtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      discount_amount: discountAmount,
      shipping_amount: shippingAmount,
      total_amount: total,
    })
    .eq("id", salesOrderId);
  if (error) throw error;

  const { error: delError } = await supabase.from("sales_order_items").delete().eq("sales_order_id", salesOrderId);
  if (delError) throw delError;

  const { error: itemsError } = await supabase.from("sales_order_items").insert(
    input.lines.map((l, i) => ({
      org_id: businessId,
      sales_order_id: salesOrderId,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      tax_rate: l.tax_rate,
      cgst_amount: breakups[i]!.cgstAmount,
      sgst_amount: breakups[i]!.sgstAmount,
      igst_amount: breakups[i]!.igstAmount,
    })),
  );
  if (itemsError) throw itemsError;
}

export async function setSalesOrderStatus(salesOrderId: string, status: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sales_orders").update({ status }).eq("id", salesOrderId);
  if (error) throw error;
}

export async function confirmSalesOrder(salesOrderId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_sales_order", { _document_id: salesOrderId });
  if (error) throw error;
}

export async function shipSalesOrder(salesOrderId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("ship_sales_order", { _document_id: salesOrderId });
  if (error) throw error;
}

export async function cancelSalesOrder(salesOrderId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_sales_order", { _document_id: salesOrderId });
  if (error) throw error;
}
