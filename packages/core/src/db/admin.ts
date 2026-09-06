import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES Row Level Security entirely.
 *
 * Server-only — this module must never be imported from a Client Component or anything
 * that ships to the browser (there is no "use client" guard because Next.js will fail the
 * build if client code imports SUPABASE_SERVICE_ROLE_KEY, since it's not NEXT_PUBLIC_).
 *
 * Use only for operations that must cross tenant boundaries by design (e.g. background
 * jobs, admin tooling) and that perform their own explicit authorization checks in code.
 * Default to db/server.ts for everything else.
 *
 * `schema` targets a module's own Postgres schema instead of the default `public` — see
 * db/server.ts's docstring.
 */
export function createAdminClient(options?: { schema?: string }): SupabaseClient {
  // Cast: targeting a non-"public" schema widens the client's own SchemaName generic to
  // `string`, but every caller here uses untyped `.from(table)` calls against `Database =
  // any` anyway, so the literal schema-name type parameter carries no real type safety to
  // preserve — the cast just lets every caller keep accepting the plain `SupabaseClient`
  // type instead of threading a schema-specific generic through every function signature.
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: options?.schema ? { schema: options.schema } : undefined,
    },
  ) as SupabaseClient;
}
