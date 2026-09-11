import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import type { AssignableEntity } from "./types";

/** crm.lead/crm.opportunity both use owner_id; crm.conversation uses assigned_to
 * (already its own column name from CRM-06.1's schema) -- the one place this mapping is
 * spelled out, so a caller never needs to know it. */
const OWNER_COLUMN: Record<AssignableEntity, "owner_id" | "assigned_to"> = {
  lead: "owner_id",
  opportunity: "owner_id",
  conversation: "assigned_to",
};

const AUDIT_ACTION: Record<AssignableEntity, string> = {
  lead: "crm_lead.assigned",
  opportunity: "crm_opportunity.assigned",
  conversation: "crm_conversation.assigned",
};

const AUDIT_ENTITY_TYPE: Record<AssignableEntity, string> = {
  lead: "crm_lead",
  opportunity: "crm_opportunity",
  conversation: "crm_conversation",
};

/**
 * CRM-05.4: "Leads/conversations/opportunities can be assigned to users" -- one function
 * for all three, since the shape (update the owning row's owner column, audit the
 * change, append to the assignment history) is identical; only the table/column names
 * differ (see OWNER_COLUMN above). `ownerId: null` unassigns.
 *
 * "Ownership changes are audited" is two things, not one: `core.audit_log` (via
 * writeAuditLog, same as CRM-04.1's status-change auditing) for the human-readable
 * "who changed what and when" trail the platform's existing Audit Log page already
 * renders; `crm.assignment` (CRM-01.2's own append-only history table, until now never
 * written to) for a queryable ownership timeline -- the open assignment row is closed
 * out (`unassigned_at`) before a new one starts, so at most one row per entity is ever
 * open at a time.
 *
 * Conversation assignment has no caller yet (CRM-06.1's Conversation Object/inbox
 * doesn't exist until the next epic) -- this function still handles it correctly since
 * the schema was already built polymorphically for all three entities, but no domain
 * event is published for it: crm.conversation.updated's existing payload is
 * status-specific, and adding a event producer with no real caller would be exactly the
 * "declare it, don't wire it" case CRM-01.4 already draws the line at.
 */
export async function assignEntity(businessId: string, entityType: AssignableEntity, entityId: string, ownerId: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const column = OWNER_COLUMN[entityType];

  const { data: before, error: beforeError } = await supabase.from(entityType).select(column).eq("id", entityId).eq("business_id", businessId).single();
  if (beforeError) throw beforeError;
  const previousOwnerId = (before as Record<string, string | null>)[column];

  const { error: updateError } = await supabase.from(entityType).update({ [column]: ownerId }).eq("id", entityId).eq("business_id", businessId);
  if (updateError) throw updateError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: AUDIT_ACTION[entityType],
    entityType: AUDIT_ENTITY_TYPE[entityType],
    entityId,
    before: { [column]: previousOwnerId },
    after: { [column]: ownerId },
  });

  // core.employees, not crm.employees -- a table that doesn't exist under the crm
  // schema, which the crm-scoped `supabase` client above can't reach.
  const core = await createCoreClient({ schema: "core" });
  const { data: assigner } = user
    ? await core.from("employees").select("id").eq("business_id", businessId).eq("user_id", user.id).maybeSingle()
    : { data: null };

  const { error: closeError } = await supabase
    .from("assignment")
    .update({ unassigned_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("unassigned_at", null);
  if (closeError) throw closeError;

  if (ownerId) {
    const { error: historyError } = await supabase.from("assignment").insert({
      business_id: businessId,
      entity_type: entityType,
      entity_id: entityId,
      owner_id: ownerId,
      assigned_by: assigner?.id ?? null,
    });
    if (historyError) throw historyError;
  }

  if (entityType === "lead") {
    await publishCrmEvent(businessId, "crm.lead.updated", { v: 1, leadId: entityId, changedFields: ["owner_id"] });
  } else if (entityType === "opportunity") {
    await publishCrmEvent(businessId, "crm.opportunity.updated", { v: 1, opportunityId: entityId, changedFields: ["owner_id"] });
  }
}
