import { createClient } from "../../db/server";
import type { SalesReturnReason, SalesReturnStatus } from "./types";

export type LineItemInput = {
  product_id: string;
  quantity: number;
  unit_price: number;
  reason: SalesReturnReason;
  restock: boolean;
  is_damaged: boolean;
};

export type SalesReturnInput = {
  sales_order_id: string;
  notes?: string | null;
  lines: LineItemInput[];
};

/** Ported from stockpilot-ai-ops's `createReturn` mutation. sales_invoice_id is resolved
 * server-side by the sales_returns compat-view insert trigger (sales-returns-workflow
 * migration), never trusted from the client, and the linked sales order's shipped/
 * delivered state is validated there too -- this just submits the header + lines. */
export async function createSalesReturn(businessId: string, input: SalesReturnInput): Promise<void> {
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("sales_returns")
    .insert({ org_id: businessId, sales_order_id: input.sales_order_id, notes: input.notes || null })
    .select()
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("sales_return_items").insert(
    input.lines.map((l) => ({
      org_id: businessId,
      sales_return_id: created.id,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      reason: l.reason,
      restock: l.restock,
      is_damaged: l.restock ? l.is_damaged : false,
    })),
  );
  if (itemsError) throw itemsError;
}

/** Approves a draft return -- calls approve_sales_return() (the sales-returns-workflow
 * migration), which posts the restock/damage stock movement per line and issues a
 * credit note against the order's invoice. */
export async function approveSalesReturn(salesReturnId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_sales_return", { _document_id: salesReturnId });
  if (error) throw error;
}

export async function setSalesReturnStatus(salesReturnId: string, status: SalesReturnStatus): Promise<void> {
  const supabase = await createClient();
  const extra: Record<string, string> = {};
  if (status === "completed") extra.completed_at = new Date().toISOString();
  if (status === "cancelled") extra.cancelled_at = new Date().toISOString();
  const { error } = await supabase.from("sales_returns").update({ status, ...extra }).eq("id", salesReturnId);
  if (error) throw error;
}
