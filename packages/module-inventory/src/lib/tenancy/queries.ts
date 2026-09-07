import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { Business } from "./types";

/** accounts/businesses live in the `core` schema (Epic 2's C-1) -- every module shares
 * them, so they're never queried through inventory's own schema-scoped client. Mirrors
 * module-discovery's own lib/tenancy/queries.ts#coreClient -- see that file's docstring. */
function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * Runs as the authenticated user through the RLS-scoped Supabase server client -- Row
 * Level Security is the source of truth for what a caller can see, not this code. A
 * business the caller doesn't belong to returns null, never another tenant's data.
 */
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
