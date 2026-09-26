import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getEffectivePermissions, getMyBusinessRole } from "@cofounderai/core/rbac/effective";
import type { BusinessRoleSummary, PermissionEntry } from "@cofounderai/core/rbac/members";
import { getBusiness } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { canAssignRole } from "./access-ui";
import type { AccessContextValue } from "./access-context";

/**
 * What every Users & Access page needs first: the business (404 when the slug isn't one
 * of the caller's), and the caller's own permissions in it -- resolved in the database
 * from the session, never from anything the browser sends (§40). Pages only use these to
 * decide what to *show*; each mutation is re-authorized by its core.* function.
 */
export async function loadAccessContext(businessSlug: string) {
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();
  const [permissions, myRole] = await Promise.all([getEffectivePermissions(businessId), getMyBusinessRole(businessId)]);
  const isOwner = myRole?.roleKey === "owner";
  return {
    businessId,
    business,
    permissions,
    myRole,
    isOwner,
    can: {
      view: permissions.has("members.view"),
      invite: permissions.has("members.invite"),
      assign: permissions.has("members.roles.assign"),
      suspend: permissions.has("members.suspend"),
      remove: permissions.has("members.remove"),
      manageRoles: permissions.has("members.roles.manage"),
      transfer: isOwner,
    },
  };
}

export type AccessCan = Awaited<ReturnType<typeof loadAccessContext>>["can"];

/** The one serialisable bundle the client-side member actions read (see access-context.tsx). */
export function buildAccessValue(
  businessSlug: string,
  context: Awaited<ReturnType<typeof loadAccessContext>>,
  roles: BusinessRoleSummary[],
  catalogue: PermissionEntry[],
): AccessContextValue {
  return {
    businessSlug,
    can: context.can,
    roles: roles
      .filter((r) => !r.archived)
      .map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        permissionKeys: r.permissionKeys,
        assignable: canAssignRole(r, context.permissions, context.isOwner),
      })),
    permissionLabel: Object.fromEntries(catalogue.map((p) => [p.key, p.description ?? p.key])),
  };
}
