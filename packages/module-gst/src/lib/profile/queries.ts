import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { GstProfile } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Ported from stockpilot-ai-ops's account.tsx `org` read (`useCurrentOrg()`), scoped to
 * just the GST fields. Returns null if the business has never saved a GST profile yet --
 * `core.business_settings` has no default row per business. */
export const getGstProfile = cache(async (businessId: string): Promise<GstProfile | null> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("business_settings")
    .select("business_id, gstin, state, gst_registration_type")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data;
});
