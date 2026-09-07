import { createClient } from "../db/server";
import type { CustomFieldDef, CustomFieldValue } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Field defs for one entity type, optionally narrowed to a service type. Passing no
 * `serviceTypeId` returns every def for the entity type (global + every service-type-
 * scoped one) -- callers that want only the global set should filter client-side by
 * `service_type_id === null`. */
export async function listCustomFieldDefs(
  businessId: string,
  entityType: string,
  serviceTypeId?: string,
): Promise<CustomFieldDef[]> {
  const supabase = await coreClient();
  let query = supabase
    .from("custom_field_defs")
    .select("*")
    .eq("business_id", businessId)
    .eq("entity_type", entityType);
  if (serviceTypeId) {
    query = query.or(`service_type_id.is.null,service_type_id.eq.${serviceTypeId}`);
  }
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return data;
}

export async function listCustomFieldValues(entityId: string): Promise<CustomFieldValue[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("custom_field_values").select("*").eq("entity_id", entityId);
  if (error) throw error;
  return data;
}
