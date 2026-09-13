import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../db/server";

function coreClient() {
  return createClient({ schema: "core" });
}

/**
 * Turns the `[businessSlug]` URL segment into the real business id every query
 * downstream still uses. Runs through the RLS-scoped server client (never the
 * service-role client) -- core.business_settings' own SELECT policy already scopes rows
 * to `user_business_ids()`, so a slug for a business the caller doesn't belong to
 * resolves to `null` here exactly as if the slug didn't exist, rather than leaking that
 * some other business owns it. Every `page.tsx`/`layout.tsx`/`route.ts` under
 * `apps/web/app/(dashboard)/[businessSlug]/` calls this once and `notFound()`s on `null`.
 *
 * `cache()`-wrapped: a deeply nested route (business -> module -> detail page) has
 * several layouts/pages each independently awaiting the same `params`, so without this
 * every one of them would re-run the same query -- `cache()` (React's per-request
 * memoization, same pattern `getBusiness`/`getProduct` in
 * packages/module-discovery/src/lib/tenancy/queries.ts already use) collapses that back
 * to one query per request regardless of how many nested segments ask for it.
 */
export const resolveBusinessIdBySlug = cache(async (
  slug: string,
  client?: SupabaseClient,
): Promise<string | null> => {
  const supabase = client ?? (await coreClient());
  const { data, error } = await supabase
    .from("business_settings")
    .select("business_id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data?.business_id ?? null;
});
