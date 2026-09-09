export type ChannelProvider = "whatsapp_business" | "instagram" | "facebook_messenger" | "google_business_messages";
export type ChannelAccountStatus = "connected" | "expired" | "revoked";
export type InstantReplyMode = "off" | "draft_approve" | "instant_ack_then_human";

/** One actually-connected external account (docs/design/crm-module-design.md Part A,
 * A1) -- never carries the decrypted tokens; see channel-accounts/queries.ts's own
 * comment for why. */
export type ChannelAccount = {
  id: string;
  business_id: string;
  channel_id: string;
  provider: ChannelProvider;
  external_account_id: string;
  status: ChannelAccountStatus;
  instant_reply_mode: InstantReplyMode;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CHANNEL_PROVIDER_LABELS: Record<ChannelProvider, string> = {
  whatsapp_business: "WhatsApp",
  instagram: "Instagram",
  facebook_messenger: "Facebook Messenger",
  google_business_messages: "Google Business Messages",
};
