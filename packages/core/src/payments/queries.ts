import { createClient } from "../db/server";
import type { DocumentAging, DocumentBalance, Payment, PaymentAllocation } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function listPaymentsForBusiness(businessId: string): Promise<Payment[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("business_id", businessId)
    .order("payment_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listAllocationsForPayment(paymentId: string): Promise<PaymentAllocation[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("payment_allocations")
    .select("*")
    .eq("payment_id", paymentId);
  if (error) throw error;
  return data;
}

/** A document's own payment history -- joined in JS from `payment_allocations` (the
 * per-document slice) to `payments` (the actual method/reference/notes), same
 * no-PostgREST-embed pattern every list query in this platform uses. Generic over any
 * `core.documents` id, so any module's invoice screen can show "who paid what, when"
 * without owning payment data itself. */
export async function listPaymentsForDocument(documentId: string): Promise<(Payment & { allocated_amount: number })[]> {
  const supabase = await coreClient();
  const { data: allocations, error: allocError } = await supabase
    .from("payment_allocations")
    .select("payment_id, amount")
    .eq("document_id", documentId);
  if (allocError) throw allocError;
  if (allocations.length === 0) return [];

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .in("id", allocations.map((a) => a.payment_id))
    .order("payment_date", { ascending: false });
  if (paymentsError) throw paymentsError;

  const allocatedByPaymentId = new Map(allocations.map((a) => [a.payment_id, Number(a.amount)]));
  return payments.map((p) => ({ ...p, allocated_amount: allocatedByPaymentId.get(p.id) ?? 0 }));
}

export async function getDocumentBalance(documentId: string): Promise<DocumentBalance | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("document_balances")
    .select("*")
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAgingForBusiness(businessId: string): Promise<DocumentAging[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("document_aging")
    .select("*")
    .eq("business_id", businessId)
    .order("days_overdue", { ascending: false });
  if (error) throw error;
  return data;
}

/** Same view, scoped to one party -- the Customer 360 panel's own "outstanding
 * balance/aging" section (docs/design/crm-module-design.md Part B, B1) reads this
 * directly rather than through any module's contract, since core.payments is
 * core-owned shared data every module (including apps/web's composition root) can
 * already read without going through a contract call. */
export async function listAgingForParty(businessId: string, partyId: string): Promise<DocumentAging[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("document_aging")
    .select("*")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .order("days_overdue", { ascending: false });
  if (error) throw error;
  return data;
}
