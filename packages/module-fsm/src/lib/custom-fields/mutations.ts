import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

export async function setCustomFieldValue(
  businessId: string,
  fieldDefId: string,
  entityId: string,
  value: unknown,
): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await coreClient();
  const { error } = await supabase
    .from("custom_field_values")
    .upsert(
      { business_id: businessId, field_def_id: fieldDefId, entity_id: entityId, value },
      { onConflict: "field_def_id,entity_id" },
    );
  if (error) throw error;
}
