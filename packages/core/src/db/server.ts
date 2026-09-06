import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for Server Components, Route Handlers, and Server Actions.
 * Runs as the authenticated user (via cookies) — RLS applies. This is the client almost
 * all server code should use.
 *
 * `schema` targets a module's own Postgres schema (00-MASTER-PLAN.md §4/§6 — e.g.
 * "discovery", "inventory") instead of the default `public`, per
 * 03-STOCKPILOT-MIGRATION.md mechanism M1. Every module's own db/server.ts should wrap
 * this with its schema baked in, rather than every call site passing it.
 */
export async function createClient(options?: { schema?: string }): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  // Cast: see db/admin.ts's docstring on the same pattern — a non-"public" schema
  // widens the SchemaName generic to `string`, which carries no real type safety here
  // since every caller uses untyped `.from(table)` against `Database = any`.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: options?.schema ? { schema: options.schema } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore when
            // middleware is refreshing the session.
          }
        },
      },
    },
  ) as SupabaseClient;
}
