import type { Interaction } from "../interactions/types";

export type ConversationStatus = "new" | "open" | "waiting" | "resolved";
export type ChannelType =
  | "whatsapp"
  | "instagram"
  | "facebook_messenger"
  | "google_business_messages"
  | "email"
  | "sms"
  | "website"
  | "manual"
  | "other";

export type Conversation = {
  id: string;
  business_id: string;
  party_id: string | null;
  primary_channel: ChannelType;
  status: ConversationStatus;
  lead_id: string | null;
  opportunity_id: string | null;
  assigned_to: string | null;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ConversationParticipant = {
  id: string;
  conversation_id: string;
  party_id: string | null;
  external_actor_id: string | null;
  role: string;
};

/** CRM-01.3's `getConversation()` return shape -- the conversation row plus its
 * participants and interaction timeline. The full unified-inbox UI (filters, party
 * context panel) is CRM-06.2's own story; this is just the data. */
export type ConversationDetail = Conversation & {
  participants: ConversationParticipant[];
  interactions: Interaction[];
};
