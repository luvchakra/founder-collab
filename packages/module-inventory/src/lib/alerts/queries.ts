import { cache } from "react";
import { createClient } from "../../db/server";
import type { Alert } from "./types";

/** Ported from stockpilot-ai-ops's routes/_authenticated/alerts.tsx `alerts` useQuery. */
export const listAlerts = cache(async (businessId: string): Promise<Alert[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});
