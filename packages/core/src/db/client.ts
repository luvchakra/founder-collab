import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Uses the publishable/anon key — RLS applies to every
 * query made through this client.
 *
 * `schema` targets a module's own Postgres schema instead of the default `public` — see
 * db/server.ts's docstring.
 */
export function createClient(options?: { schema?: string }) {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: options?.schema ? { schema: options.schema } : undefined },
  );
}
