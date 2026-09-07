import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";

/** Service-role Supabase client scoped to the `inventory` schema. BYPASSES Row Level
 * Security entirely — see @cofounderai/core/db/admin's docstring before using this. */
export function createAdminClient() {
  return createCoreAdminClient({ schema: "inventory" });
}
