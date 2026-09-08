import { cache } from "react";
import { createClient } from "../../db/server";
import type { ServiceTypeOption } from "./types";

/** Full CRUD for service types is F-15's own settings screen -- this is just the
 * lookup list opportunities/jobs pickers need now. */
export const listActiveServiceTypeOptions = cache(async (businessId: string): Promise<ServiceTypeOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_types")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return data;
});
