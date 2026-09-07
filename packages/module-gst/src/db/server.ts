import { createClient as createCoreClient } from "@cofounderai/core/db/server";

/** Server-side Supabase client scoped to the `gst` schema (00-MASTER-PLAN.md §4).
 * Runs as the authenticated user — RLS applies. Note the credential tables have no
 * SELECT grant/policy for `authenticated` at all (see the gst schema migration) — this
 * client can write them but can never read the secret columns back, by design. */
export async function createClient() {
  return createCoreClient({ schema: "gst" });
}
