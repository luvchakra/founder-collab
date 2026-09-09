import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Designates (or un-designates) a business member as a technician who can be assigned
 * schedule events. `core.employees` has no unique constraint on (business_id, user_id)
 * -- it wasn't designed around an idempotent-upsert use case when C-2 created it -- so
 * this checks for an existing row itself rather than relying on `on conflict`.
 * Deactivating never deletes the row (matches ADR-9's "cancelling never deletes data"
 * spirit -- a technician taken off the roster keeps their history of past assigned
 * events intact; `is_active = false` just stops them appearing as an assignable
 * option). */
export async function setTechnicianStatus(businessId: string, userId: string, isTechnician: boolean): Promise<void> {
  await requireModule(businessId, "fsm");
  const core = await coreClient();
  const { data: existing, error: fetchError } = await core
    .from("employees")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    const { error } = await core.from("employees").update({ is_active: isTechnician }).eq("id", existing.id);
    if (error) throw error;
    return;
  }

  if (!isTechnician) return;
  const { error } = await core.from("employees").insert({ business_id: businessId, user_id: userId, is_active: true });
  if (error) throw error;
}
