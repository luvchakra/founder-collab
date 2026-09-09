import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";

export async function createServiceType(businessId: string, name: string, description?: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required.");
  const supabase = await createClient();
  const { error } = await supabase.from("service_types").insert({ business_id: businessId, name: trimmed, description: description?.trim() || null });
  if (error) throw error;
}

export async function updateServiceType(id: string, businessId: string, name: string, description?: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_types")
    .update({ name: trimmed, description: description?.trim() || null })
    .eq("id", id)
    .eq("business_id", businessId);
  if (error) throw error;
}

/** Deactivate, never delete -- a service type may already be referenced by existing
 * opportunities/jobs/custom-field scoping; toggling `is_active` (already how the
 * active-only picker filters) keeps history intact, same reasoning `setJobCustomFieldAction`-
 * adjacent settings elsewhere in this platform use for "retire, don't destroy". */
export async function setServiceTypeActive(id: string, businessId: string, isActive: boolean): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await createClient();
  const { error } = await supabase.from("service_types").update({ is_active: isActive }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}
