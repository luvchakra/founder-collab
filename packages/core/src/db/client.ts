import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client. Uses the publishable/anon key — RLS applies to every
 * query made through this client.
 *
 * `schema` targets a module's own Postgres schema instead of the default `public` — see
 * db/server.ts's docstring.
 */
export function createClient(options?: { schema?: string }): SupabaseClient {
  // Cast: see db/admin.ts's docstring on the same pattern — a non-"public" schema
  // widens the SchemaName generic to `string`, which carries no real type safety here
  // since every caller uses untyped `.from(table)` against `Database = any`.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: options?.schema ? { schema: options.schema } : undefined },
  ) as SupabaseClient;
}
