import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { Business } from "./types";

/** accounts/businesses live in the `core` schema (Epic 2's C-1) -- every module shares
 * them, so they're never queried through fsm's own schema-scoped client. Small,
 * module-local copy of module-inventory's own lib/tenancy/queries.ts#coreClient -- a
 * module can't import another module's internals, only `contract/`, which
 * module-inventory doesn't expose this through. */
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
  const { data, error } = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (error) throw error;
  return data;
});
