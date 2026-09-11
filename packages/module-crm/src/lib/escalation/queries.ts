import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { DEFAULT_ESCALATION_CONFIG, type EscalationConfig } from "./types";

/** Returns the business's own stored config if it has customized anything, or the
 * documented defaults otherwise -- see types.ts's own doc comment on why a missing row
 * isn't an error. Defaults to the RLS-scoped server client; pass `client` (the admin
 * client) for the cron sweep, which has no session. */
export async function getEscalationConfig(businessId: string, client?: SupabaseClient): Promise<EscalationConfig> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("escalation_config")
    .select("reminder_delay_minutes, owner_escalation_delay_minutes, manager_escalation_delay_minutes, manager_employee_id")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { businessId, ...DEFAULT_ESCALATION_CONFIG };

  return {
    businessId,
    reminderDelayMinutes: data.reminder_delay_minutes,
    ownerEscalationDelayMinutes: data.owner_escalation_delay_minutes,
    managerEscalationDelayMinutes: data.manager_escalation_delay_minutes,
    managerEmployeeId: data.manager_employee_id,
  };
}
