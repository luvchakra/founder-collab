import { cache } from "react";
import { createClient } from "../../db/server";
import type { FsmSettings } from "./types";

const DEFAULTS: Omit<FsmSettings, "business_id"> = {
  reminder_lead_hours: 48,
  arrival_window_minutes: 120,
  auto_invoice_on_complete: false,
  default_terms: null,
  estimate_expiry_days: null,
  customer_center_enabled: false,
  contact_form_enabled: false,
};

/** `/fsm/settings`'s own read -- every business gets a settings *view* even before its
 * first save creates a real `fsm.settings` row (matches the column defaults every
 * other reader of this table already falls back to when the row is missing: F-8's
 * `auto_invoice_on_complete` check, F-9's `reminder_lead_hours`, F-10's
 * `customer_center_enabled`/`contact_form_enabled`). */
export const getFsmSettings = cache(async (businessId: string): Promise<FsmSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("*").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return data ? { ...DEFAULTS, ...data } : { business_id: businessId, ...DEFAULTS };
});
