export type FollowUpStatus = "pending" | "completed" | "snoozed" | "cancelled";
export type FollowUpPriority = "low" | "normal" | "high";

export type FollowUp = {
  id: string;
  business_id: string;
  party_id: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  conversation_id: string | null;
  activity_id: string | null;
  owner_id: string | null;
  due_at: string;
  status: FollowUpStatus;
  /** CRM-05.3. Defaults 'normal' -- drives the queue's "high-priority" view/filter. */
  priority: FollowUpPriority;
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateFollowUpInput = {
  partyId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  activityId?: string | null;
  ownerId?: string | null;
  dueAt: string;
  priority?: FollowUpPriority;
};

/**
 * CRM-05.3's queue row -- a FollowUp enriched with the party name, and the source/
 * channel of whichever entity it's attached to, resolved via separate lookups (not a
 * PostgREST embedded select) the same way opportunities/products.ts and
 * opportunities/contacts.ts already resolve their own cross-table display fields.
 * `source`/`channel` are read from the attached lead's `source` or conversation's
 * `primary_channel` -- there's no single column for either on crm.follow_up itself,
 * since which one applies depends on what the follow-up is attached to.
 */
export type FollowUpQueueRow = FollowUp & {
  partyName: string | null;
  source: string | null;
  channel: string | null;
};
