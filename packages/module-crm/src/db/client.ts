import { createClient as createCoreClient } from "@cofounderai/core/db/client";

/** Browser-side Supabase client scoped to the `crm` schema -- see db/server.ts. */
export function createClient() {
  return createCoreClient({ schema: "crm" });
}
