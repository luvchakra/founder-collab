import { createClient } from "../../db/server";
import type { CreateFollowUpInput, FollowUp } from "./types";

export async function createFollowUp(businessId: string, input: CreateFollowUpInput): Promise<FollowUp> {
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
  return data as FollowUp;
}

/** CRM-05.3: "queue is actionable from one screen" -- completing is the one action this
 * story needs. Snoozing (with its own reason field and search-visibility requirement) is
 * CRM-05.6's own separate story. */
export async function completeFollowUp(businessId: string, followUpId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("follow_up")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", followUpId)
    .eq("business_id", businessId);
  if (error) throw error;
}
