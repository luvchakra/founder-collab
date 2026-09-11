import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { publishCrmEvent } from "../../events/publish";
import type { CreateFollowUpInput, FollowUp } from "./types";

/** Publishes `crm.follow_up.created` (CRM-01.4) -- that vocabulary entry already existed
 * before this mutation did; wiring it up was missed in CRM-05.3's initial pass and is
 * fixed here. */
export async function createFollowUp(businessId: string, input: CreateFollowUpInput): Promise<FollowUp> {
  await requirePermission(businessId, "activities.manage");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_up")
    .insert({
      business_id: businessId,
      party_id: input.partyId ?? null,
      lead_id: input.leadId ?? null,
      opportunity_id: input.opportunityId ?? null,
      conversation_id: input.conversationId ?? null,
      activity_id: input.activityId ?? null,
      owner_id: input.ownerId ?? null,
      due_at: input.dueAt,
      priority: input.priority ?? "normal",
    })
    .select("*")
    .single();
  if (error) throw error;

  await publishCrmEvent(businessId, "crm.follow_up.created", { v: 1, followUpId: data.id, dueAt: data.due_at, ownerId: data.owner_id });

  return data as FollowUp;
}

/** CRM-05.3: "queue is actionable from one screen" -- completing is the one action this
 * story needs. Snoozing (with its own reason field and search-visibility requirement) is
 * CRM-05.6's own separate story. Publishes `crm.follow_up.completed` (CRM-01.4). */
export async function completeFollowUp(businessId: string, followUpId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("follow_up")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", followUpId)
    .eq("business_id", businessId);
  if (error) throw error;

  await publishCrmEvent(businessId, "crm.follow_up.completed", { v: 1, followUpId });
}
