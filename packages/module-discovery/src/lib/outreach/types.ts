export type OutreachChannel = "email" | "linkedin" | "whatsapp";
export type OutreachStrategyStatus = "draft" | "approved";

export type OutreachStrategy = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  contact_id: string | null;
  strategy: string;
  channel: OutreachChannel;
  reason: string;
  key_message: string;
  cta: string;
  status: OutreachStrategyStatus;
  created_at: string;
  updated_at: string;
};
