import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { Business, BusinessGstProfile, BusinessMember } from "./types";

/** accounts/businesses live in the `core` schema (Epic 2's C-1) -- every module shares
 * them, so they're never queried through inventory's own schema-scoped client. Mirrors
 * module-discovery's own lib/tenancy/queries.ts#coreClient -- see that file's docstring. */
function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * Runs as the authenticated user through the RLS-scoped Supabase server client -- Row
 * Level Security is the source of truth for what a caller can see, not this code. A
 * business the caller doesn't belong to returns null, never another tenant's data.
 */
export const getBusiness = cache(async (businessId: string): Promise<Business | null> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** The business's own GST state/GSTIN, needed to resolve CGST/SGST-vs-IGST on purchase
 * and sales orders (the business is always one side of the transaction). Small,
 * module-local copy of module-gst's own `getGstProfile` -- a module can't import
 * another module's internals, only `contract/`, which module-gst doesn't have yet
 * (matches this file's own `Business` type's "each module keeps its own small copy"
 * precedent). Returns null fields (not an error) when the business hasn't saved a GST
 * profile yet -- `core.business_settings` has no default row per business. */
export const getBusinessGstProfile = cache(async (businessId: string): Promise<BusinessGstProfile> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("business_settings")
    .select("gstin, state")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return { gstin: data?.gstin ?? null, state: data?.state ?? null };
});

/** Ported from stockpilot-ai-ops's routes/_authenticated/team.tsx `members` useQuery --
 * business_members.user_id has no foreign key to user_profiles (a service-created member
 * never requires a matching auth user up front), so names are joined here rather than
 * embedded in the select, same as the original's own client-side join. RLS-scoped: a
 * caller only ever sees the members of businesses they themselves belong to. */
export const listBusinessMembers = cache(async (businessId: string): Promise<BusinessMember[]> => {
  const supabase = await coreClient();
  const { data: rows, error } = await supabase
    .from("business_members")
    .select("id, user_id, role, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from("user_profiles").select("id, full_name, email").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    role: r.role,
    created_at: r.created_at,
    full_name: profileById.get(r.user_id)?.full_name ?? null,
    email: profileById.get(r.user_id)?.email ?? null,
  }));
});
