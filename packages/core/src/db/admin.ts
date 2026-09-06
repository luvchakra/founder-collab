import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
