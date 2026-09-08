import { cache } from "react";
import { createClient } from "../../db/server";
import type { JobChargeType, JobChargeTypeOption } from "./types";

/** `/fsm/settings`'s own list (F-15) -- every job charge type, active or not. */
export const listJobChargeTypes = cache(async (businessId: string): Promise<JobChargeType[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_charge_types").select("*").eq("business_id", businessId).order("name");
  if (error) throw error;
  return data;
});

/** The lookup list estimate charge lines need (PRD §1: "each with a Job Charge Type for
 * reporting"). */
export const listActiveJobChargeTypeOptions = cache(async (businessId: string): Promise<JobChargeTypeOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_charge_types")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data;
});
