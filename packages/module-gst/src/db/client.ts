import { createClient as createCoreClient } from "@cofounderai/core/db/client";

/** Browser-side Supabase client scoped to the `gst` schema — see db/server.ts. */
export function createClient() {
  return createCoreClient({ schema: "gst" });
}
