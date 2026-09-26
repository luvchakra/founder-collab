"use server";

import { cookies } from "next/headers";
import { acceptInvitation } from "@cofounderai/core/rbac/members";
import { resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";

/** RBAC-08 -- accepts as the signed-in user; the database checks the invitation is theirs,
 * pending and unexpired, and makes exactly one membership. */
export async function acceptInvitationAction(token: string): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const result = await acceptInvitation(token);
  if (!result.ok) return result;
  (await cookies()).delete("wa_pending_invite");
  const slug = result.value ? await resolveBusinessSlugById(result.value.businessId) : null;
  return { ok: true, href: slug ? `/${slug}/business` : "/dashboard" };
}
