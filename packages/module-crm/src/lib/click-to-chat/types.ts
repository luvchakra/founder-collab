export type ClickToChatLink = {
  id: string;
  business_id: string;
  label: string;
  whatsapp_number: string;
  ref_code: string;
  campaign: string | null;
  prefilled_message: string;
  is_active: boolean;
  created_at: string;
};
