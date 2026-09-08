import { createClient } from "../../db/server";

export async function createJobChargeType(businessId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required.");
  const supabase = await createClient();
  const { error } = await supabase.from("job_charge_types").insert({ business_id: businessId, name: trimmed });
  if (error) throw error;
}

export async function updateJobChargeType(id: string, businessId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required.");
  const supabase = await createClient();
  const { error } = await supabase.from("job_charge_types").update({ name: trimmed }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}

/** Deactivate, never delete -- existing `core.document_lines.job_charge_type_id`
 * references stay intact (a bare/no-FK column, F-3's own design), and the active-only
 * picker already filters on this flag. */
export async function setJobChargeTypeActive(id: string, businessId: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("job_charge_types").update({ is_active: isActive }).eq("id", id).eq("business_id", businessId);
  if (error) throw error;
}
