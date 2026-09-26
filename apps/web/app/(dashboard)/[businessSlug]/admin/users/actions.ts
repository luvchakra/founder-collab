"use server";

import { revalidatePath } from "next/cache";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import {
  changeMemberRole,
  inviteMember,
  revokeInvitation,
  setMemberStatus,
  transferOwnership,
} from "@cofounderai/core/rbac/members";

/**
 * RBAC-21..24 -- thin wrappers over core/rbac/members.ts. Only ids and form text cross
 * from the browser; every decision (may this person invite, is that role within their
 * ceiling, is this the last owner) is made again by the core.* function the call lands
 * in, and its refusal comes back as a readable `{ ok: false, error }`.
 */
type ActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

const NOT_FOUND: ActionResult<never> = { ok: false, error: "Business not found." };

function refresh(businessSlug: string) {
  revalidatePath(`/${businessSlug}/admin/users`, "layout");
  revalidatePath(`/${businessSlug}/admin/roles`, "layout");
}

export async function inviteMemberAction(
  businessSlug: string,
  input: { email: string; name: string; roleId: string; message: string },
): Promise<ActionResult<{ emailed: boolean }>> {
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) return NOT_FOUND;
  const result = await inviteMember({ businessId, email: input.email, name: input.name, roleId: input.roleId, message: input.message });
  if (result.ok) refresh(businessSlug);
  return result;
}

export async function revokeInvitationAction(businessSlug: string, invitationId: string): Promise<ActionResult> {
  const result = await revokeInvitation(invitationId);
  if (result.ok) refresh(businessSlug);
  return result;
}

export async function changeMemberRoleAction(businessSlug: string, memberId: string, roleId: string): Promise<ActionResult> {
  const result = await changeMemberRole(memberId, roleId);
  if (result.ok) refresh(businessSlug);
  return result;
}

export async function setMemberStatusAction(
  businessSlug: string,
  memberId: string,
  status: "active" | "suspended" | "removed",
  reason: string | null,
): Promise<ActionResult> {
  if (status !== "active" && status !== "suspended" && status !== "removed") return { ok: false, error: "Unknown status." };
  const result = await setMemberStatus(memberId, status, reason?.trim() ? reason.trim().slice(0, 500) : null);
  if (result.ok) refresh(businessSlug);
  return result;
}

export async function transferOwnershipAction(businessSlug: string, memberId: string): Promise<ActionResult> {
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) return NOT_FOUND;
  const result = await transferOwnership(businessId, memberId);
  if (result.ok) refresh(businessSlug);
  return result;
}
