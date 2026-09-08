export interface FsmSettings {
  business_id: string;
  reminder_lead_hours: number;
  arrival_window_minutes: number;
  auto_invoice_on_complete: boolean;
  default_terms: string | null;
  estimate_expiry_days: number | null;
  customer_center_enabled: boolean;
  contact_form_enabled: boolean;
}

/** Every field optional -- an upsert only overwrites what the form actually submitted,
 * and a business with no `fsm.settings` row yet (every business, until its first save
 * here) gets one created with these plus the column defaults for anything omitted. */
export type UpdateFsmSettingsInput = Partial<Omit<FsmSettings, "business_id">>;
