import { cache } from "react";
import { createClient } from "../../db/server";
import type { ServiceType, ServiceTypeOption } from "./types";

/** `/fsm/settings`'s own list (F-15) -- every service type, active or not, ordered the
 * same way the active-only picker above is (sort_order then name), so the settings
 * screen's own ordering matches what staff would see reflected in every picker. */
export const listServiceTypes = cache(async (businessId: string): Promise<ServiceType[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("service_types").select("*").eq("business_id", businessId).order("sort_order").order("name");
  if (error) throw error;
  return data;
});

/** The lookup list opportunities/jobs pickers need. */
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
