import { cache } from "react";
import { createClient } from "../../db/server";
import type { JobChargeTypeOption } from "./types";

/** Full CRUD for job charge types is F-15's own settings screen -- this is just the
 * lookup list estimate charge lines need now (PRD §1: "each with a Job Charge Type for
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
