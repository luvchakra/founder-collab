export type ChannelKind = "email" | "sms" | "whatsapp" | "social";

export type Channel = {
  id: string;
  business_id: string;
  kind: ChannelKind;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
