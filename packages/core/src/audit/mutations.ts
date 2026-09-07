import { createClient } from "../db/server";

/**
 * Writes an audit_log entry directly from application code -- for a state transition
 * that isn't (or can't cleanly be) driven by a database trigger. Most transitions should
 * prefer a trigger calling core.write_audit_log() directly (see D-9's migration for two
 * examples): a trigger fires no matter which code path caused the change, while this
 * helper only fires if every call site remembers to call it.
 */
export async function writeAuditLog(input: {
  businessId: string;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<string> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("write_audit_log", {
    p_business_id: input.businessId,
    p_actor_id: input.actorId ?? null,
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId ?? null,
    p_before: input.before ?? null,
    p_after: input.after ?? null,
  });
  if (error) throw error;
  return data as string;
}
