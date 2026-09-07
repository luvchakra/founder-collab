import { createClient } from "../db/server";
import type { AuditLogEntry } from "./types";

/**
 * `core.audit_log` is genuinely business-wide, not module-scoped -- its
 * `document.status_changed` trigger fires for every module that uses `core.documents`
 * (inventory's purchase/sales orders and returns today; other modules as they adopt the
 * same table), and `business_settings.updated`/`stock.adjusted` are core- and
 * inventory-owned respectively. Callers pass `entityType`/`actorId`/date-range filters,
 * not a module filter -- there is no such column, by design (D-10).
 */
export async function listAuditLogForBusiness(
  businessId: string,
  filters?: { entityType?: string; actorId?: string; dateFrom?: string; dateTo?: string },
): Promise<AuditLogEntry[]> {
  const supabase = await createClient({ schema: "core" });
  let query = supabase.from("audit_log").select("*").eq("business_id", businessId);
  if (filters?.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters?.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters?.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters?.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return data;
}

export type AuditActor = { id: string; name: string };

/** Actor names are joined server-side, not via a foreign key -- an actor may since have
 * left the business (core.business_members has no soft-delete), same reasoning as
 * stockpilot-ai-ops's own audit-log page joining organization_members/profiles by hand. */
export async function listAuditActors(businessId: string): Promise<AuditActor[]> {
  const supabase = await createClient({ schema: "core" });
  const { data: members, error: membersError } = await supabase
    .from("business_members")
    .select("user_id")
    .eq("business_id", businessId);
  if (membersError) throw membersError;

  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("user_profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  if (profilesError) throw profilesError;

  return (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || p.id }));
}
