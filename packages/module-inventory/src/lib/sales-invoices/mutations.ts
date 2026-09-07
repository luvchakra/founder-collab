import { createClient } from "../../db/server";
import type { PaymentStatus } from "./types";

/** Ported from stockpilot-ai-ops's `generateInvoice` mutation -- calls SP-3b's existing
 * generate_sales_invoice() RPC, which copies the order's header totals + line-level tax
 * snapshots. Returns the new invoice id (the UI opens its detail view immediately). */
export async function generateSalesInvoice(salesOrderId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_sales_invoice", { _document_id: salesOrderId });
  if (error) throw error;
  return data as string;
}

export async function updateInvoicePaymentStatus(invoiceId: string, paymentStatus: PaymentStatus): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sales_invoices").update({ payment_status: paymentStatus }).eq("id", invoiceId);
  if (error) throw error;
}

export type CreateCreditNoteInput = { isFull: boolean; subtotal?: number | null; reason?: string | null };

/** Ported from stockpilot-ai-ops's `createCreditNote` mutation -- calls the
 * create_credit_note() RPC added by the sales-returns-workflow migration, which derives
 * a full credit note's tax as whatever remains uncredited and a partial one's
 * proportionally to the invoice's own rate. */
export async function createCreditNote(invoiceId: string, input: CreateCreditNoteInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_credit_note", {
    _invoice_id: invoiceId,
    _is_full: input.isFull,
    _subtotal: input.isFull ? null : input.subtotal ?? null,
    _reason: input.reason || null,
  });
  if (error) throw error;
}
