import { createClient } from "../db/server";

/**
 * Mints the next document number for a business+scope (e.g. 'sales_order', 'invoice',
 * 'job', 'estimate'), fiscal-year aware and gap-free under concurrent callers -- see
 * core.next_number() (D-5) for the mechanism. Call this inside the same transaction as
 * the document it numbers wherever the caller can (a Postgres function/RPC that both
 * mints the number and inserts the document); calling it from application code in its
 * own round trip before a separate insert is safe from duplicates but not from a gap if
 * that later insert fails.
 */
export async function nextNumber(businessId: string, scope: string, prefix: string): Promise<string> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("next_number", {
    p_business_id: businessId,
    p_scope: scope,
    p_prefix: prefix,
  });
  if (error) throw error;
  return data;
}
