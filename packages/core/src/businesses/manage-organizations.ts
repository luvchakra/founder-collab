import { createClient } from "../db/server";
import { seedDefaultLicenses } from "../licensing/lifecycle";
import type { OrgEnvironment } from "../lib/org-address";

/**
 * PLATFORM-P1-10.8 (Manage Organizations) and PLATFORM-P1-10.14 (Organization Onboarding),
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40. The owner's side: every call runs as
 * the signed-in person, and the database decides whether they own what they touch
 * (core.is_organization_owner(), migration 20261013120000).
 */

export type ManagedBusiness = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  disabledByOwner: boolean;
  environment: OrgEnvironment;
  parentId: string | null;
};

export type ManagedOrganization = ManagedBusiness & { environments: ManagedBusiness[] };

const ORDER: OrgEnvironment[] = ["production", "development", "test", "staging", "sandbox"];

/** Organizations with their environments, by the link (never by rank). Pure, for tests. */
export function groupManaged(rows: ManagedBusiness[]): ManagedOrganization[] {
  const ids = new Set(rows.map((r) => r.id));
  return rows
    .filter((r) => !r.parentId || !ids.has(r.parentId))
    .map((root) => ({
      ...root,
      environments: [root, ...rows.filter((r) => r.parentId === root.id)].sort((a, b) => ORDER.indexOf(a.environment) - ORDER.indexOf(b.environment)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getMyManagedOrganizations(): Promise<ManagedOrganization[]> {
  const core = await createClient({ schema: "core" });
  const { data, error } = await core.rpc("my_managed_organizations");
  if (error) throw error;
  return groupManaged(
    ((data ?? []) as { business_id: string; name: string; slug: string; status: "active" | "suspended"; disabled_by_owner: boolean; environment: OrgEnvironment; parent_business_id: string | null }[]).map((r) => ({
      id: r.business_id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      disabledByOwner: r.disabled_by_owner,
      environment: r.environment,
      parentId: r.parent_business_id,
    })),
  );
}

export type OwnerResult = { ok: true; message?: string } | { ok: false; error: string };

export async function renameMyOrganization(businessId: string, name: string): Promise<OwnerResult> {
  const core = await createClient({ schema: "core" });
  const { error } = await core.rpc("owner_rename_organization", { p_business: businessId, p_name: name });
  return error ? { ok: false, error: error.message } : { ok: true, message: "Renamed." };
}

export async function setMyOrganizationDisabled(businessId: string, disabled: boolean): Promise<OwnerResult> {
  const core = await createClient({ schema: "core" });
  const { data, error } = await core.rpc("owner_set_organization_disabled", { p_business: businessId, p_disabled: disabled });
  if (error) return { ok: false, error: error.message };
  const n = Array.isArray(data) ? data.length : 0;
  if (n === 0) return { ok: true, message: "Nothing to change." };
  return { ok: true, message: `${disabled ? "Disabled" : "Enabled"} ${n === 1 ? "1 environment" : `${n} environments`}.` };
}

/** A new organization at the address and environment its creator chose. The database checks
 * the account, the address and the environment; the default modules are switched on after,
 * as for any new business. */
export async function createBusinessWithAddress(
  accountId: string,
  input: { name: string; slug: string; environment: OrgEnvironment; description?: string; website?: string },
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const core = await createClient({ schema: "core" });
  const { data: id, error } = await core.rpc("create_business_with_address", {
    p_account: accountId,
    p_name: input.name,
    p_slug: input.slug,
    p_environment: input.environment,
  });
  if (error) return { ok: false, error: error.message };
  const patch: Record<string, string> = {};
  if (input.description?.trim()) patch.description = input.description.trim();
  if (input.website?.trim()) patch.website = input.website.trim();
  if (Object.keys(patch).length) await core.from("businesses").update(patch).eq("id", id as string);
  await seedDefaultLicenses(id as string);
  return { ok: true, id: id as string, slug: input.slug.trim().toLowerCase() };
}
