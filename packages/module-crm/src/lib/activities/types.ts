export type ActivityType =
  | "call"
  | "meeting"
  | "note"
  | "email"
  | "whatsapp"
  | "social"
  | "task"
  | "follow_up"
  | "quote_follow_up"
  | "service_follow_up";

export type Activity = {
  id: string;
  business_id: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  party_id: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  conversation_id: string | null;
  owner_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** At least one of partyId/leadId/opportunityId/conversationId is required -- crm.activity's
 * own `activity_attached_to_something` check constraint enforces this at the database
 * level (CRM-05.1: "Activity can be attached to party, lead, opportunity or conversation"). */
export type CreateActivityInput = {
  type: ActivityType;
  subject?: string | null;
  body?: string | null;
  partyId?: string | null;
  leadId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  ownerId?: string | null;
  dueAt?: string | null;
};
