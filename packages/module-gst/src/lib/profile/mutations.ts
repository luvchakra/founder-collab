import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

export type GstProfileInput = {
  gstin: string | null;
  state: string | null;
  gst_registration_type: string;
};

/**
 * Ported from stockpilot-ai-ops's `saveOrg` mutation, scoped to the GST fields. Upserts
 * (not a plain update) since `core.business_settings` has no row until the first save --
 * `core.business_settings`'s own RLS already has both an INSERT and an UPDATE policy for
 * exactly this reason.
 */
export async function upsertGstProfile(businessId: string, input: GstProfileInput): Promise<void> {
  await requireModule(businessId, "gst");
  const supabase = await coreClient();
  const { error } = await supabase.from("business_settings").upsert({
    business_id: businessId,
    gstin: input.gstin,
    state: input.state,
    gst_registration_type: input.gst_registration_type,
  });
  if (error) throw error;
}
