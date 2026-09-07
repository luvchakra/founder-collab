import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";

/** Service-role Supabase client scoped to the `gst` schema. BYPASSES Row Level Security
 * entirely — this is the ONLY client that can ever read a GSP credential's secret
 * columns back (gsp_password/client_secret), by design (see the gst schema migration).
 * Use only from trusted server-side code (a future generate/cancel server action), never
 * from a route that echoes the result to the browser. */
export function createAdminClient() {
  return createCoreAdminClient({ schema: "gst" });
}
