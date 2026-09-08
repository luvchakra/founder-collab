import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { publish } from "@cofounderai/core/events/mutations";
import { createClient } from "../../db/server";
import type { PaymentStatus } from "./types";

/** Ported from stockpilot-ai-ops's `generateInvoice` mutation -- calls SP-3b's existing
 * generate_sales_invoice() RPC, which copies the order's header totals + line-level tax
 * snapshots. Returns the new invoice id (the UI opens its detail view immediately).
 *
 * Also publishes `document.issued` (S-2, 00-MASTER-PLAN.md §6's event catalogue --
 * "fsm, inventory -> gst (e-invoice)"), the counterpart to
 * `module-fsm/lib/invoices/mutations.ts#issueInvoice`'s own publish call: a generated
 * sales invoice has no separate later "issue" step in this module's own model (there is
 * no `status='issued'` transition anywhere in `generate_sales_invoice()` -- a generated
 * invoice is immediately final, tracked by `payment_status` instead), so "generated" is
 * this module's own equivalent of "issued". `requiredModule: 'gst'` parks the event for
 * an unlicensed business rather than failing it permanently for lack of a handler. */
export async function generateSalesInvoice(salesOrderId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_sales_invoice", { _document_id: salesOrderId });
  if (error) throw error;
  const invoiceId = data as string;

  const core = await createCoreClient({ schema: "core" });
  const { data: invoice, error: invoiceError } = await core.from("documents").select("business_id").eq("id", invoiceId).single();
  if (invoiceError) throw invoiceError;

  await publish({ businessId: invoice.business_id, type: "document.issued", payload: { invoiceId, docType: "invoice" }, requiredModule: "gst" });

  return invoiceId;
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
