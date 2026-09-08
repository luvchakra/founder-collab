import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { CustomFieldDef, CustomFieldWithValue } from "./types";

/** `core.custom_field_defs`/`core.custom_field_values` (D-8) are core-owned, generic
 * across every entity type in every module (the entity-ownership map: "Kickserv Forms &
 * Fields, per entity type and per service type"). FSM's own `entity_type` values are
 * "opportunity" and "job" -- no check constraint restricts these (core/D-8's own design),
 * so no schema change was needed to introduce them. */
function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Defs that apply to every row of `entityType` (`service_type_id is null`) plus any
 * scoped specifically to `serviceTypeId`, matching the PRD's own "on jobs (globally or
 * per service type)" (§1.11). */
export const listCustomFieldDefs = cache(
  async (businessId: string, entityType: string, serviceTypeId: string | null): Promise<CustomFieldDef[]> => {
    const supabase = await coreClient();
    let query = supabase
      .from("custom_field_defs")
      .select("id, entity_type, service_type_id, key, label, field_type, options, is_required, sort_order")
      .eq("business_id", businessId)
      .eq("entity_type", entityType);
    query = serviceTypeId
      ? query.or(`service_type_id.is.null,service_type_id.eq.${serviceTypeId}`)
      : query.is("service_type_id", null);
    const { data, error } = await query.order("sort_order");
    if (error) throw error;
    return data;
  },
);

/** Every def applicable to `entityId` (per its own `serviceTypeId`), each joined with
 * its current value (or `null` if never set) -- no PostgREST embed across these two
 * tables, joined here in JS, same "no embed" precedent as tags/queries.ts. */
export const listCustomFieldsWithValues = cache(
  async (
    businessId: string,
    entityType: string,
    serviceTypeId: string | null,
    entityId: string,
  ): Promise<CustomFieldWithValue[]> => {
    const defs = await listCustomFieldDefs(businessId, entityType, serviceTypeId);
    if (defs.length === 0) return [];

    const supabase = await coreClient();
    const { data: values, error } = await supabase
      .from("custom_field_values")
      .select("field_def_id, value")
      .eq("business_id", businessId)
      .eq("entity_id", entityId)
      .in(
        "field_def_id",
        defs.map((d) => d.id),
      );
    if (error) throw error;
    const valueByDefId = new Map(values.map((v) => [v.field_def_id, v.value]));

    return defs.map((def) => ({ ...def, value: valueByDefId.get(def.id) ?? null }));
  },
);
