import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { Business } from "./types";

/** accounts/businesses live in the `core` schema (Epic 2's C-1) -- every module shares
 * them, so they're never queried through gst's own schema-scoped client. Mirrors
 * module-inventory's own lib/tenancy/queries.ts#coreClient -- see that file's docstring. */
function coreClient() {
  return createCoreClient({ schema: "core" });
}

export const getBusiness = cache(async (businessId: string): Promise<Business | null> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data;
});
