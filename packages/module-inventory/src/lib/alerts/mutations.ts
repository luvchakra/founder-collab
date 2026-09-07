import { createClient } from "../../db/server";
import type { Alert, AlertStatus } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/alerts.tsx `updateStatus`
 * mutation -- resolving or dismissing an alert stamps resolved_at, matching the
 * original's own patch shape exactly. */
export async function updateAlertStatus(alertId: string, status: AlertStatus): Promise<Alert> {
  const supabase = await createClient();
  const patch: { status: AlertStatus; resolved_at?: string } = { status };
  if (status === "resolved" || status === "dismissed") {
    patch.resolved_at = new Date().toISOString();
  }
  const { data, error } = await supabase.from("alerts").update(patch).eq("id", alertId).select().single();
  if (error) throw error;
  return data;
}
