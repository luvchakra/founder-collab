import { createClient } from "../db/server";
import type { AuditLogEntry } from "./types";

export async function listAuditLogForBusiness(businessId: string, entityType?: string): Promise<AuditLogEntry[]> {
  const supabase = await createClient({ schema: "core" });
  let query = supabase.from("audit_log").select("*").eq("business_id", businessId);
  if (entityType) query = query.eq("entity_type", entityType);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
