import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { RESOURCE_KEYS, type ResourceKey } from "./platform-limits-constants";
import { overrideStatus, type OverrideStatus } from "./platform-business-overrides-status";

export { overrideStatus, type OverrideStatus };

/**
 * PLATFORM-P1-02.1 (Business Override), PLATFORM-P1-02.2 (Temporary Entitlement) and
 * PLATFORM-P1-02.3 (Override Audit), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §24. A
 * superadmin gives one business a different limit for one resource for a fixed window. The
 * rules live in migration 20261010150000: reason and expiry required, no overlaps, no edits,
 * every create and revoke written to platform.audit_log. Enforcement is in getLimit() and
 * core.try_consume_usage_counter().
 */

export type BusinessOverride = {
  id: string;
  businessId: string;
  businessName: string | null;
  resourceKey: ResourceKey;
  state: "limited" | "unlimited";
  limitValue: number | null;
  reason: string;
  startsAt: string;
  expiresAt: string;
  createdBy: string | null;
  createdByEmail: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  status: OverrideStatus;
};

type OverrideRow = {
  id: string;
  business_id: string;
  resource_key: ResourceKey;
  state: "limited" | "unlimited";
  limit_value: number | null;
  reason: string;
  starts_at: string;
  expires_at: string;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export async function listBusinessOverrides(now: number = Date.now()): Promise<BusinessOverride[]> {
  await requireSuperadmin();
  const supabase = await createClient({ schema: "platform" });
  const { data, error } = await supabase
    .from("business_limit_overrides")
    .select("id, business_id, resource_key, state, limit_value, reason, starts_at, expires_at, created_by, created_at, revoked_at, revoke_reason")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data as OverrideRow[];
  if (rows.length === 0) return [];

  // Names for display: superadmins aren't members of these businesses, so read them with the
  // service-role client, after requireSuperadmin() above.
  const core = createAdminClient({ schema: "core" });
  const businessIds = Array.from(new Set(rows.map((r) => r.business_id)));
  const userIds = Array.from(new Set(rows.map((r) => r.created_by).filter((v): v is string => v !== null)));
  const [businesses, users] = await Promise.all([
    core.from("businesses").select("id, name").in("id", businessIds),
    userIds.length > 0 ? core.from("user_profiles").select("id, email").in("id", userIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (businesses.error) throw businesses.error;
  if (users.error) throw users.error;
  const nameById = new Map((businesses.data as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const emailById = new Map((users.data as { id: string; email: string | null }[]).map((u) => [u.id, u.email]));

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    businessName: nameById.get(r.business_id) ?? null,
    resourceKey: r.resource_key,
    state: r.state,
    limitValue: r.limit_value,
    reason: r.reason,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    createdBy: r.created_by,
    createdByEmail: r.created_by ? (emailById.get(r.created_by) ?? null) : null,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
    revokeReason: r.revoke_reason,
    status: overrideStatus(r.starts_at, r.expires_at, r.revoked_at, now),
  }));
}

export type BusinessOption = { id: string; name: string };

/** Every business on the platform, for the "New override" picker. */
export async function listBusinessOptions(): Promise<BusinessOption[]> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient({ schema: "core" }).from("businesses").select("id, name").order("name");
  if (error) throw error;
  return data as BusinessOption[];
}

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

export const createBusinessOverrideSchema = z
  .object({
    businessId: z.string().uuid("Pick a business."),
    resourceKey: z.enum(RESOURCE_KEYS),
    state: z.enum(["limited", "unlimited"]),
    limitValue: z.coerce.number().int("Enter a whole number.").min(0, "Enter 0 or more.").nullable(),
    startsOn: isoDate.nullable(),
    expiresOn: isoDate,
    reason: z.string().trim().min(1, "A reason is required.").max(500, "Reason must be 500 characters or fewer."),
  })
  .superRefine((v, ctx) => {
    if (v.state === "limited" && v.limitValue === null) ctx.addIssue({ code: "custom", path: ["limitValue"], message: "Enter a limit." });
    if (v.startsOn && v.startsOn >= v.expiresOn) ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "The expiry must be after the start." });
  });

export type CreateBusinessOverrideInput = z.input<typeof createBusinessOverrideSchema>;

function invalid(error: z.ZodError): Result {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, error: Object.values(fieldErrors)[0] ?? "Invalid input.", fieldErrors };
}

/** Dates are whole UTC days: an override starts at 00:00 UTC on its start date (or now, when
 * none is given) and ends at 00:00 UTC the day after its expiry date. */
export async function createBusinessOverride(input: CreateBusinessOverrideInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = createBusinessOverrideSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const expiresAt = new Date(`${d.expiresOn}T00:00:00Z`);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("create_business_limit_override", {
    p_business_id: d.businessId,
    p_resource_key: d.resourceKey,
    p_state: d.state,
    p_limit_value: d.state === "limited" ? d.limitValue : null,
    p_starts_at: d.startsOn ? `${d.startsOn}T00:00:00Z` : null,
    p_expires_at: expiresAt.toISOString(),
    p_reason: d.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revokeBusinessOverride(id: string, reason: string): Promise<Result> {
  await requireSuperadmin();
  const parsed = z
    .object({ id: z.string().uuid(), reason: z.string().trim().min(1, "A reason is required.").max(500) })
    .safeParse({ id, reason });
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient({ schema: "platform" });
  const { error } = await supabase.rpc("revoke_business_limit_override", { p_id: parsed.data.id, p_reason: parsed.data.reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
