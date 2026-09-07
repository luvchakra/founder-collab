import { createClient } from "../db/server";

export type PermissionCatalogEntry = { key: string; module: string; description: string };

/** The full permission catalogue (C-7) -- not tenant data, every authenticated user can
 * read it (a Team/permissions page needs the full picture to render "what can each role
 * do"), matching stockpilot-ai-ops's own usePermissionCatalog(). */
export async function listPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("permissions").select("key, module, description").order("key");
  if (error) throw error;
  return data;
}

/** role -> the set of permission keys granted to it. `owner`/`admin` have a literal row
 * per permission (seeded in C-7's migration as a cross join), not a code-level special
 * case, so a plain read of core.role_permissions already reflects "owner can do
 * everything" correctly. */
export async function listRolePermissions(): Promise<Record<string, Set<string>>> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase.from("role_permissions").select("role, permission_key");
  if (error) throw error;

  const byRole: Record<string, Set<string>> = {};
  for (const row of data) {
    const set = byRole[row.role] ?? new Set<string>();
    set.add(row.permission_key);
    byRole[row.role] = set;
  }
  return byRole;
}
