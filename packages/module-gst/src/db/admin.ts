import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";

/** Service-role Supabase client scoped to the `gst` schema. BYPASSES Row Level Security
 * entirely — this is the ONLY client that can ever read a GSP credential's secret
 * columns back (`encrypted_gsp_password`/`encrypted_client_secret`, encrypted at rest
 * since 2026-09-09 -- decrypted via `gsp-client.ts`'s own `decryptGspSecrets()`
 * immediately before the one outbound GSP call that needs the plaintext), by design
 * (see the gst schema migration). Use only from trusted server-side code (the generate/
 * cancel server actions), never from a route that echoes the result to the browser. */
export function createAdminClient() {
  return createCoreAdminClient({ schema: "gst" });
}
