"use server";

import { revalidatePath } from "next/cache";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { archiveRole, createRole, updateRole } from "@cofounderai/core/rbac/members";

/**
 * RBAC-25..30 -- thin wrappers over core/rbac/members.ts. The permission keys the form
 * sends are only a request: core.create_role / core.update_role re-check that the caller
 * may manage roles in this business and may grant every key (the privilege ceiling, §12).
 */
type ActionResult<T = undefined> = { ok: true; value?: T } | { ok: false; error: string };

type RoleInput = { name: string; description: string; permissionKeys: string[] };

function refresh(businessSlug: string) {
  revalidatePath(`/${businessSlug}/admin/roles`, "layout");
  revalidatePath(`/${businessSlug}/admin/users`, "layout");
}

export async function createRoleAction(
  businessSlug: string,
  input: RoleInput & { templateKey: string | null },
): Promise<ActionResult<{ roleId: string }>> {
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) return { ok: false, error: "Business not found." };
  const result = await createRole(businessId, {
    name: input.name,
    description: input.description,
    permissionKeys: input.permissionKeys,
    templateKey: input.templateKey || null,
  });
  if (result.ok) refresh(businessSlug);
  return result;
}

export async function updateRoleAction(businessSlug: string, roleId: string, input: RoleInput): Promise<ActionResult> {
  const result = await updateRole(roleId, { name: input.name, description: input.description, permissionKeys: input.permissionKeys });
  if (result.ok) refresh(businessSlug);
  return result;
}

export async function archiveRoleAction(businessSlug: string, roleId: string): Promise<ActionResult> {
  const result = await archiveRole(roleId);
  if (result.ok) refresh(businessSlug);
  return result;
}
