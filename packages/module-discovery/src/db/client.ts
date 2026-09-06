import { createClient as createCoreClient } from "@cofounderai/core/db/client";

/** Browser-side Supabase client scoped to the `discovery` schema — see db/server.ts. */
export function createClient() {
  return createCoreClient({ schema: "discovery" });
}
