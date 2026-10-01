import { createClient } from "../db/server";

/**
 * Thin wrappers over the financial-control functions in
 * 20260908100000_core_financial_controls.sql. Every rule (permissions, maker-checker,
 * period locks, reasons) is enforced in the database; these just call it with the
 * signed-in user's session so the rules apply to them.
 */
function coreClient() {
  return createClient({ schema: "core" });
}

/** Locks a numbered document's amounts, party, dates and lines (needs documents.post). */
export async function postDocument(documentId: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.rpc("post_document", { p_document_id: documentId });
  if (error) throw error;
}

/** Voids a payment with a reason (needs payments.void; the recorder can't void their
 * own unless they're an owner/admin). Payments are never edited or deleted. */
export async function voidPayment(paymentId: string, reason: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.rpc("void_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) throw error;
}

export async function getClosedThrough(businessId: string): Promise<string | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase.rpc("closed_through", { p_business_id: businessId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Needs finance.close_period. Only moves the close date forward. */
export async function closeBooksThrough(businessId: string, date: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.rpc("close_books_through", { p_business_id: businessId, p_date: date });
  if (error) throw error;
}

/** Needs finance.reopen_period (a different permission from closing) and a reason. Pass
 * `date: null` to reopen everything. */
export async function reopenBooks(businessId: string, date: string | null, reason: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.rpc("reopen_books", {
    p_business_id: businessId,
    p_date: date,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function hasPermission(businessId: string, permissionKey: string): Promise<boolean> {
  const supabase = await coreClient();
  const { data, error } = await supabase.rpc("has_permission", {
    p_business_id: businessId,
    p_key: permissionKey,
  });
  if (error) throw error;
  return data === true;
}
