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
