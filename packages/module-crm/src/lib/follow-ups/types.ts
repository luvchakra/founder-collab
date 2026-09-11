export type FollowUpStatus = "pending" | "completed" | "snoozed" | "cancelled";

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
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
