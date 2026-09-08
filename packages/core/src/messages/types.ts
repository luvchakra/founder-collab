export type MessageDirection = "inbound" | "outbound";
export type MessageChannel = "email" | "sms";
export type MessageStatus = "draft" | "sent" | "delivered" | "failed" | "received";

export interface Thread {
  id: string;
  business_id: string;
  entity_type: string;
  entity_id: string;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  business_id: string;
  thread_id: string;
  direction: MessageDirection;
  channel: MessageChannel;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body: string;
  status: MessageStatus;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  business_id: string;
  name: string;
  subject: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}
