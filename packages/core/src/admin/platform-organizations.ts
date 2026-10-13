import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { activateLicense } from "../licensing/lifecycle";
import type { ModuleKey } from "../licensing/types";
import type { OrgEnvironment } from "../lib/org-address";
import {
  EMPTY_PROFILE,
  profileToRow,
  validateOrganizationProfile,
  type OrganizationProfile,
} from "./platform-organization-profile-rules";

/**
 * PLATFORM-P1-10.10 (Organizations Console), PLATFORM-P1-10.11 (Environment Console) and
 * PLATFORM-P1-10.12 (Organization Details), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §40. The vendor's view of every organization (a root business) and its environments.
 *
 * Every function starts with requireSuperadmin(), then reads with the service role (the
 * vendor isn't a member of these businesses). Changes go through the platform.* functions of
 * migrations 20261013100000/110000, which validate and audit in the same transaction; the
 * acting superadmin's id is passed in as the audit actor.
 */

export type ConsoleBusiness = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "decommissioned";
  environment: OrgEnvironment;
  parentId: string | null;
  plan: string;
  notes: string | null;
  disabledByOwner: boolean;
  suspensionReason: string | null;
  createdAt: string;
};

export type ConsoleOwner = { userId: string; email: string | null; name: string | null };

export type ConsoleOrganization = ConsoleBusiness & {
  environments: ConsoleBusiness[];
  owners: ConsoleOwner[];
  isTest: boolean;
};

const ENVIRONMENT_ORDER: OrgEnvironment[] = ["production", "development", "test", "staging", "sandbox"];

/** Groups businesses into organizations by the link an environment carries to its
 * organization -- never by environment rank (WonderID grouped a development organization's
 * Test environment under the wrong root that way). A child whose organization is missing is
 * shown as its own organization rather than hidden. Pure, for tests. */
export function groupOrganizations(rows: ConsoleBusiness[]): (ConsoleBusiness & { environments: ConsoleBusiness[] })[] {
  const ids = new Set(rows.map((r) => r.id));
  const roots = rows.filter((r) => !r.parentId || !ids.has(r.parentId));
  return roots
    .map((root) => ({
      ...root,
      environments: [root, ...rows.filter((r) => r.parentId === root.id)].sort(
        (a, b) => ENVIRONMENT_ORDER.indexOf(a.environment) - ENVIRONMENT_ORDER.indexOf(b.environment),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Test and fixture organizations sit in their own section (display only). */
export function isTestOrganization(slug: string, ownerEmails: (string | null)[]): boolean {
  if (/^(e2e|fixture|qa)-/.test(slug)) return true;
  const emails = ownerEmails.filter((e): e is string => Boolean(e));
  return emails.length > 0 && emails.every((e) => /@(example\.(test|com|org)|e2e\.[a-z0-9.-]+)$/i.test(e));
}

async function loadBusinesses(): Promise<ConsoleBusiness[]> {
  const core = createAdminClient({ schema: "core" });
  const platform = createAdminClient({ schema: "platform" });
  const [businesses, settings, environments] = await Promise.all([
    core.from("businesses").select("id, name, status, disabled_by_owner, suspension_reason, created_at"),
    core.from("business_settings").select("business_id, slug, plan"),
    platform.from("business_environments").select("business_id, environment, parent_business_id, notes"),
  ]);
  if (businesses.error) throw businesses.error;
  if (settings.error) throw settings.error;
  if (environments.error) throw environments.error;
  const settingsById = new Map((settings.data ?? []).map((s) => [s.business_id as string, s]));
  const envById = new Map((environments.data ?? []).map((e) => [e.business_id as string, e]));
  return (businesses.data ?? []).map((b) => {
    const s = settingsById.get(b.id as string);
    const e = envById.get(b.id as string);
    return {
      id: b.id as string,
      name: b.name as string,
      slug: (s?.slug as string | undefined) ?? "",
      status: b.status as ConsoleBusiness["status"],
      environment: ((e?.environment as OrgEnvironment | undefined) ?? "production") as OrgEnvironment,
      parentId: (e?.parent_business_id as string | null | undefined) ?? null,
      plan: (s?.plan as string | undefined) ?? "free",
      notes: (e?.notes as string | null | undefined) ?? null,
      disabledByOwner: Boolean(b.disabled_by_owner),
      suspensionReason: (b.suspension_reason as string | null) ?? null,
      createdAt: b.created_at as string,
    };
  });
}

async function loadOwners(businessIds: string[]): Promise<Map<string, ConsoleOwner[]>> {
  const out = new Map<string, ConsoleOwner[]>();
  if (businessIds.length === 0) return out;
  const core = createAdminClient({ schema: "core" });
  const { data: members, error } = await core
    .from("business_members")
    .select("business_id, user_id")
    .in("business_id", businessIds)
    .eq("status", "active")
    .eq("role", "owner");
  if (error) throw error;
  const userIds = Array.from(new Set((members ?? []).map((m) => m.user_id as string)));
  const { data: profiles, error: profileError } = userIds.length
    ? await core.from("user_profiles").select("id, email, full_name").in("id", userIds)
    : { data: [], error: null };
  if (profileError) throw profileError;
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  for (const m of members ?? []) {
    const p = byId.get(m.user_id as string);
    const list = out.get(m.business_id as string) ?? [];
    list.push({ userId: m.user_id as string, email: (p?.email as string | null) ?? null, name: (p?.full_name as string | null) ?? null });
    out.set(m.business_id as string, list);
  }
  return out;
}

/** Every organization with its environments and owners. Decommissioned ones only on request. */
export async function listOrganizations(options: { includeDecommissioned?: boolean } = {}): Promise<ConsoleOrganization[]> {
  await requireSuperadmin();
  const rows = (await loadBusinesses()).filter((r) => options.includeDecommissioned || r.status !== "decommissioned");
  const groups = groupOrganizations(rows);
  const owners = await loadOwners(groups.map((g) => g.id));
  return groups.map((g) => {
    const o = owners.get(g.id) ?? [];
    return { ...g, owners: o, isTest: isTestOrganization(g.slug, o.map((x) => x.email)) };
  });
}

/** The organization a business belongs to (itself, if it is the organization), and which of its
 * environments was asked for. Null when no such business exists. */
export async function getOrganization(businessId: string): Promise<{ organization: ConsoleOrganization; selected: ConsoleBusiness; profile: OrganizationProfile } | null> {
  await requireSuperadmin();
  const rows = await loadBusinesses();
  const selected = rows.find((r) => r.id === businessId);
  if (!selected) return null;
  const rootId = selected.parentId && rows.some((r) => r.id === selected.parentId) ? selected.parentId : selected.id;
  const group = groupOrganizations(rows.filter((r) => r.id === rootId || r.parentId === rootId)).find((g) => g.id === rootId);
  if (!group) return null;
  const owners = (await loadOwners([rootId])).get(rootId) ?? [];
  const { data: profileRow, error } = await createAdminClient({ schema: "platform" })
    .from("organization_profiles")
    .select("*")
    .eq("business_id", rootId)
    .maybeSingle();
  if (error) throw error;
  const profile: OrganizationProfile = profileRow
    ? {
        description: profileRow.description,
        contactName: profileRow.contact_name,
        contactEmail: profileRow.contact_email,
        contactPhone: profileRow.contact_phone,
        companyName: profileRow.company_name,
        companyEmail: profileRow.company_email,
        companyPhone: profileRow.company_phone,
        industry: profileRow.industry,
        userBaseSize: profileRow.user_base_size,
        country: profileRow.country,
        website: profileRow.website,
      }
    : EMPTY_PROFILE;
  return {
    organization: { ...group, owners, isTest: isTestOrganization(group.slug, owners.map((o) => o.email)) },
    selected,
    profile,
  };
}

// ---------------------------------------------------------------------------------------
// Actions. Each returns what actually happened, in words when it didn't.
// ---------------------------------------------------------------------------------------

export type ConsoleResult = { ok: true; message?: string } | { ok: false; error: string };

async function actorId(): Promise<string> {
  await requireSuperadmin();
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) throw new Error("Not signed in.");
  return data.user.id;
}

async function call(fn: string, args: Record<string, unknown>): Promise<ConsoleResult> {
  const p_actor = await actorId();
  const { error } = await createAdminClient({ schema: "platform" }).rpc(fn, { p_actor, ...args });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Adds an environment, then switches on the modules the organization has (the plan is
 * copied by the database function). A module that can't be switched on is reported. */
export async function createEnvironment(organizationId: string, environment: OrgEnvironment): Promise<ConsoleResult> {
  const p_actor = await actorId();
  const platform = createAdminClient({ schema: "platform" });
  const { data: newId, error } = await platform.rpc("create_business_environment", { p_actor, p_parent: organizationId, p_environment: environment });
  if (error) return { ok: false, error: error.message };
  const { data: licenses, error: licenseError } = await createAdminClient({ schema: "core" })
    .from("licenses")
    .select("module_key")
    .eq("business_id", organizationId)
    .eq("status", "active");
  if (licenseError) return { ok: true, message: "Environment created, but its modules couldn't be read to switch them on. Check its licences." };
  const failed: string[] = [];
  for (const l of licenses ?? []) {
    try {
      await activateLicense(newId as string, l.module_key as ModuleKey);
    } catch {
      failed.push(l.module_key as string);
    }
  }
  return failed.length
    ? { ok: true, message: `Environment created, but these modules couldn't be switched on: ${failed.join(", ")}.` }
    : { ok: true, message: "Environment created." };
}

export const removeEnvironment = (businessId: string) => call("remove_business_environment", { p_business: businessId });
export const removeOrganization = (businessId: string) => call("remove_organization", { p_business: businessId });
export const renameOrganization = (businessId: string, name: string) => call("rename_organization", { p_business: businessId, p_name: name });
export const changeAddress = (businessId: string, slug: string) => call("rename_business_slug", { p_business: businessId, p_slug: slug.trim().toLowerCase() });
export const setEnvironmentType = (businessId: string, environment: OrgEnvironment) =>
  call("set_business_environment", { p_business: businessId, p_environment: environment });
export const setBusinessNotes = (businessId: string, notes: string) => call("set_business_notes", { p_business: businessId, p_notes: notes });

export async function setBusinessStatus(businessId: string, status: "active" | "suspended", reason: string): Promise<ConsoleResult> {
  if (status === "suspended" && !reason.trim()) return { ok: false, error: "Say why it's being suspended." };
  return call("set_business_status", { p_business: businessId, p_status: status, p_reason: reason });
}

/** One plan for the organization and every environment; provider-billed ones are left alone
 * and reported (PLATFORM-P1-10.6). */
export async function setOrganizationPlan(organizationId: string, plan: string): Promise<ConsoleResult> {
  const p_actor = await actorId();
  const { data, error } = await createAdminClient({ schema: "platform" }).rpc("set_organization_plan", { p_actor, p_business: organizationId, p_plan: plan });
  if (error) return { ok: false, error: error.message };
  const rows = (data as { business_id: string; changed: boolean }[] | null) ?? [];
  const skipped = rows.filter((r) => !r.changed).length;
  return skipped
    ? { ok: true, message: `${rows.length - skipped} of ${rows.length} environments changed. ${skipped} ${skipped === 1 ? "is" : "are"} billed by a payment provider; change ${skipped === 1 ? "it" : "those"} in Billing.` }
    : { ok: true, message: `Plan set for all ${rows.length} environments.` };
}

export async function saveOrganizationProfile(organizationId: string, input: Partial<Record<keyof OrganizationProfile, string>>): Promise<ConsoleResult> {
  const checked = validateOrganizationProfile(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  return call("save_organization_profile", { p_business: organizationId, p_profile: profileToRow(checked.profile) });
}
