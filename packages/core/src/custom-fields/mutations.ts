import { createClient } from "../db/server";
import type { CustomFieldDef, CustomFieldType, CustomFieldValue } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function createCustomFieldDef(input: {
  businessId: string;
  entityType: string;
  serviceTypeId?: string | null;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options?: string[] | null;
  isRequired?: boolean;
  sortOrder?: number;
}): Promise<CustomFieldDef> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("custom_field_defs")
    .insert({
      business_id: input.businessId,
      entity_type: input.entityType,
      service_type_id: input.serviceTypeId ?? null,
      key: input.key,
      label: input.label,
      field_type: input.fieldType,
      options: input.options ?? null,
      is_required: input.isRequired ?? false,
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setCustomFieldValue(input: {
  businessId: string;
  fieldDefId: string;
  entityId: string;
  value: unknown;
}): Promise<CustomFieldValue> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("custom_field_values")
    .upsert(
      {
        business_id: input.businessId,
        field_def_id: input.fieldDefId,
        entity_id: input.entityId,
        value: input.value,
      },
      { onConflict: "field_def_id,entity_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
