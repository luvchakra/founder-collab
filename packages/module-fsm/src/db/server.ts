import { createClient as createCoreClient } from "@cofounderai/core/db/server";

/** Server-side Supabase client scoped to the `fsm` schema (00-MASTER-PLAN.md §4). Runs
 * as the authenticated user — RLS applies. */
export async function createClient() {
  return createCoreClient({ schema: "fsm" });
}
