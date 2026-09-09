import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { aggregateGst, computeLineGst, resolveStateCode } from "@cofounderai/core/lib/gst";

export type LineItemInput = { product_id: string; quantity: number; unit_cost: number; tax_rate: number };

export type PurchaseOrderInput = {
  supplier_id: string;
  warehouse_id: string;
  expected_delivery_date?: string | null;
  notes?: string | null;
  discount_amount?: number;
  shipping_amount?: number;
  lines: LineItemInput[];
};

function newPoNumber() {
  return `PO-${Date.now().toString(36).toUpperCase()}`;
}

/** Computes each line's CGST/SGST/IGST server-side (never trusting client-computed tax
 * amounts for a financial document) from the business's own GST profile and the
 * supplier's state/GSTIN -- same math as stockpilot-ai-ops's client-side computeLineGst
 * call, just moved behind the mutation so the persisted amounts are always trustworthy
 * regardless of what a client sent. */
async function computeTotals(
  businessId: string,
  supplierId: string,
  lines: LineItemInput[],
  discountAmount: number,
  shippingAmount: number,
) {
  const supabase = await createClient();
  const core = await createCoreClient({ schema: "core" });

  const [{ data: settings }, { data: supplier, error: supplierError }] = await Promise.all([
    core.from("business_settings").select("gstin, state").eq("business_id", businessId).maybeSingle(),
    supabase.from("suppliers").select("state, gst_number").eq("id", supplierId).single(),
  ]);
  if (supplierError) throw supplierError;

  const buyerStateCode = resolveStateCode(settings?.state ?? null, settings?.gstin ?? null);
  const sellerStateCode = resolveStateCode(supplier?.state ?? null, supplier?.gst_number ?? null);

  const breakups = lines.map((l) =>
    computeLineGst({
      taxableValue: l.quantity * l.unit_cost,
      gstRatePercent: l.tax_rate,
      sellerStateCode,
      buyerStateCode,
    }),
  );
  const totals = aggregateGst(breakups);
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost, 0);
  const total = subtotal + totals.totalTax + shippingAmount - discountAmount;

  return { breakups, subtotal, totals, total };
}

/** Ported from stockpilot-ai-ops's `savePo` mutation -- create branch. */
export async function createPurchaseOrder(businessId: string, input: PurchaseOrderInput): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const discountAmount = input.discount_amount ?? 0;
  const shippingAmount = input.shipping_amount ?? 0;
  const { breakups, subtotal, totals, total } = await computeTotals(
    businessId,
    input.supplier_id,
    input.lines,
    discountAmount,
    shippingAmount,
  );

  const { data: po, error } = await supabase
    .from("purchase_orders")
    .insert({
      org_id: businessId,
      po_number: newPoNumber(),
      supplier_id: input.supplier_id,
      warehouse_id: input.warehouse_id,
      expected_delivery_date: input.expected_delivery_date || null,
      notes: input.notes || null,
      subtotal,
      tax_amount: totals.totalTax,
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

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    input.lines.map((l, i) => ({
      org_id: businessId,
      purchase_order_id: po.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      tax_rate: l.tax_rate,
      cgst_amount: breakups[i]!.cgstAmount,
      sgst_amount: breakups[i]!.sgstAmount,
      igst_amount: breakups[i]!.igstAmount,
    })),
  );
  if (itemsError) throw itemsError;
}

/** Ported from stockpilot-ai-ops's `savePo` mutation -- update branch. Draft-only edit,
 * so nothing has been received against these items yet -- safe to replace the whole set
 * rather than diff it. */
export async function updatePurchaseOrder(
  businessId: string,
  purchaseOrderId: string,
  input: PurchaseOrderInput,
): Promise<void> {
  await requireModule(businessId, "inventory");
  const supabase = await createClient();
  const discountAmount = input.discount_amount ?? 0;
  const shippingAmount = input.shipping_amount ?? 0;
  const { breakups, subtotal, totals, total } = await computeTotals(
    businessId,
    input.supplier_id,
    input.lines,
    discountAmount,
    shippingAmount,
  );

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: input.supplier_id,
      warehouse_id: input.warehouse_id,
      expected_delivery_date: input.expected_delivery_date || null,
      notes: input.notes || null,
      subtotal,
      tax_amount: totals.totalTax,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      discount_amount: discountAmount,
      shipping_amount: shippingAmount,
      total_amount: total,
    })
    .eq("id", purchaseOrderId);
  if (error) throw error;

  const { error: delError } = await supabase.from("purchase_order_items").delete().eq("purchase_order_id", purchaseOrderId);
  if (delError) throw delError;

  const { error: itemsError } = await supabase.from("purchase_order_items").insert(
    input.lines.map((l, i) => ({
      org_id: businessId,
      purchase_order_id: purchaseOrderId,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
      tax_rate: l.tax_rate,
      cgst_amount: breakups[i]!.cgstAmount,
      sgst_amount: breakups[i]!.sgstAmount,
      igst_amount: breakups[i]!.igstAmount,
    })),
  );
  if (itemsError) throw itemsError;
}

export async function setPurchaseOrderStatus(purchaseOrderId: string, status: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_orders").update({ status }).eq("id", purchaseOrderId);
  if (error) throw error;
}

export async function receivePurchaseOrderItem(itemId: string, quantity: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_purchase_order_item", {
    _document_line_id: itemId,
    _quantity: quantity,
  });
  if (error) throw error;
}
