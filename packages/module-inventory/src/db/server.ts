import { createClient as createCoreClient } from "@cofounderai/core/db/server";

/** Server-side Supabase client scoped to the `inventory` schema (00-MASTER-PLAN.md §4;
 * 03-STOCKPILOT-MIGRATION.md mechanism M1). Runs as the authenticated user — RLS applies. */
export async function createClient() {
  return createCoreClient({ schema: "inventory" });
}
