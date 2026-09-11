import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import type { Activity, CreateActivityInput } from "./types";

/** CRM-01.3's `createActivity()` contract operation. Validated here (not just left to
 * crm.activity's own check constraint) so a caller gets a clear message instead of a raw
 * Postgres constraint-violation error. */
export async function createActivity(businessId: string, input: CreateActivityInput): Promise<Activity> {
  if (!input.partyId && !input.leadId && !input.opportunityId && !input.conversationId) {
    throw new Error("createActivity: at least one of partyId, leadId, opportunityId, conversationId is required");
  }
  await requirePermission(businessId, "activities.manage");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity")
    .insert({
      business_id: businessId,
      type: input.type,
      subject: input.subject ?? null,
      body: input.body ?? null,
      party_id: input.partyId ?? null,
      lead_id: input.leadId ?? null,
      opportunity_id: input.opportunityId ?? null,
      conversation_id: input.conversationId ?? null,
      owner_id: input.ownerId ?? null,
      due_at: input.dueAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Activity;
}

/** CRM-05.2's "completing an action" -- just stamps completed_at. Clearing the
 * completed activity off its lead/opportunity's own next_action_id (so the UI's "no
 * next action set" empty state -- and its add-next-action form -- appears in its place)
 * is the caller's job (leads/mutations.ts#clearLeadNextAction,
 * opportunities/mutations.ts#clearOpportunityNextAction), not this function's: an
 * activity can be completed without ever having been anyone's "next action" at all. */
export async function completeActivity(businessId: string, activityId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("activity")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", activityId)
    .eq("business_id", businessId);
  if (error) throw error;
}
