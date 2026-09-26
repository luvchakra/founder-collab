import { cache } from "react";
import { createClient } from "../db/server";
import { hasModule } from "../licensing/queries";
import { MODULE_VIEW_PERMISSION } from "./module-permissions";

/**
 * RBAC-05 / RBAC-18 / RBAC-20 -- the caller's authority in one business
 * (docs/plan/15-MULTI-USER-RBAC-BACKLOG.md §4, §29-§31, §40).
 *
 * Everything resolves in the database from the session (core.effective_permissions,
 * core.user_role_for_business) -- never from a claim, a cookie or a client-supplied role
 * -- and is re-evaluated on every request (§46), so a role change or suspension takes
 * effect on the next protected request. cache() only de-duplicates within one request.
 */

export type BusinessRole = { roleId: string; roleKey: string; roleName: string; roleType: "system" | "custom" };

export const getEffectivePermissions = cache(async (businessId: string): Promise<Set<string>> => {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("effective_permissions", { p_business_id: businessId });
  if (error) throw error;
  return new Set(((data ?? []) as unknown[]).map((row) => (typeof row === "string" ? row : String(Object.values(row as object)[0]))));
});

export const getMyBusinessRole = cache(async (businessId: string): Promise<BusinessRole | null> => {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("user_role_for_business", { p_business_id: businessId });
  if (error) throw error;
  const row = ((data ?? []) as { role_id: string; role_key: string; role_name: string; role_type: "system" | "custom" }[])[0];
  return row ? { roleId: row.role_id, roleKey: row.role_key, roleName: row.role_name, roleType: row.role_type } : null;
});

export { MODULE_VIEW_PERMISSION };

export class PermissionDeniedError extends Error {
  constructor(
    readonly reason: "not_licensed" | "no_permission",
    message: string,
  ) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/**
 * §40 -- licence AND permission, in that order, with the two failures kept distinct
 * (§31): "isn't included in your plan" is not "you don't have permission".
 */
export async function requireModulePermission(businessId: string, moduleKey: string, permissionKey: string, moduleName = moduleKey): Promise<void> {
  if (!(await hasModule(businessId, moduleKey))) {
    throw new PermissionDeniedError("not_licensed", `${moduleName} isn't included in your current plan.`);
  }
  const permissions = await getEffectivePermissions(businessId);
  if (!permissions.has(permissionKey)) {
    throw new PermissionDeniedError("no_permission", `You don't have permission to do this in ${moduleName}. Contact your business administrator.`);
  }
}

/** Non-throwing: which modules this user may open in this business (navigation, §30). */
export async function viewableModules(businessId: string, licensedModuleKeys: string[]): Promise<string[]> {
  const permissions = await getEffectivePermissions(businessId);
  return licensedModuleKeys.filter((key) => {
    const view = MODULE_VIEW_PERMISSION[key];
    return !view || permissions.has(view);
  });
}

export type BusinessAccess = { roleKey: string; roleName: string; permissions: Set<string> };

/** RBAC-30 / RBAC-31 -- role and permissions for every business the user can enter, in one
 * query (core.my_business_access()), for the shell's switcher and navigation. */
export const getMyBusinessAccess = cache(async (): Promise<Map<string, BusinessAccess>> => {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.rpc("my_business_access");
  if (error) throw error;
  return new Map(
    ((data ?? []) as { business_id: string; role_key: string; role_name: string; permissions: string[] | null }[]).map((r) => [
      r.business_id,
      { roleKey: r.role_key, roleName: r.role_name, permissions: new Set(r.permissions ?? []) },
    ]),
  );
});

/** Licensed modules narrowed to those the role may open (§30: licensed AND permission.view). */
export function modulesVisibleTo(access: BusinessAccess | undefined, licensedModuleKeys: string[]): string[] {
  if (!access) return [];
  return licensedModuleKeys.filter((key) => {
    const view = MODULE_VIEW_PERMISSION[key];
    return !view || access.permissions.has(view);
  });
}
