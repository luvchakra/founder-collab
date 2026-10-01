import { createClient } from "../db/server";
import type { AuditChainVerification, AuditLogEntry } from "./types";

/** RLS-scoped: returns nothing unless the caller has audit.view on the business. */
export async function listAuditLogForBusiness(
  businessId: string,
  entityType?: string,
  limit = 500,
): Promise<AuditLogEntry[]> {
  const supabase = await createClient({ schema: "core" });
  let query = supabase.from("audit_log").select("*").eq("business_id", businessId);
  if (entityType) query = query.eq("entity_type", entityType);
  const { data, error } = await query.order("seq", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

/** Recomputes the business's audit hash chain (core.verify_audit_chain). Needs audit.view. */
export async function verifyAuditChain(businessId: string): Promise<AuditChainVerification> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("verify_audit_chain", { p_business_id: businessId });
  if (error) throw error;
  const row = (data as AuditChainVerification[])[0];
  return row ?? { valid: true, entries_checked: 0, first_invalid_seq: null, reason: null };
}
