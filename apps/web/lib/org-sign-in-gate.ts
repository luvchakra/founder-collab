import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@cofounderai/core/db/server";
import { getHostBusiness } from "./org-host";

/**
 * PLATFORM-P1-10.2 (Address Sign-in). On an organization's address only that organization's
 * members sign in, and a paused organization (suspended, or disabled by its owner) refuses
 * sign-in. On the main address, and with addresses off, these return null and change nothing.
 * The address never grants access; these only refuse.
 */

/** Before credentials are checked: nothing to sign in to here. */
export async function orgAddressClosedReason(): Promise<string | null> {
  const business = await getHostBusiness().catch(() => ({ unavailable: true }) as const);
  if (!business) return null;
  if ("unavailable" in business) return "We couldn't check this organization just now. Try again in a minute.";
  if ("missing" in business) return "No organization is at this address.";
  if (business.status !== "active") return `${business.name} is paused, so sign-in is closed. Contact its owner.`;
  return null;
}

/** After sign-in: the new session ends unless the person belongs to this address's
 * organization. Membership is read under their own RLS, the same rule every page uses. */
export async function refuseNonMemberOnOrgAddress(supabase?: SupabaseClient): Promise<string | null> {
  const closed = await orgAddressClosedReason();
  const client = supabase ?? (await createClient());
  if (closed) {
    await client.auth.signOut({ scope: "local" });
    return closed;
  }
  const business = await getHostBusiness().catch(() => null);
  if (!business || "missing" in business) return null;
  const core = await createClient({ schema: "core" });
  const { data, error } = await core.from("businesses").select("id").eq("id", business.businessId).maybeSingle();
  if (!error && data) return null;
  await client.auth.signOut({ scope: "local" });
  return error
    ? "We couldn't check your membership just now. Try again in a minute."
    : `This account isn't a member of ${business.name}. Ask its owner for an invitation.`;
}
