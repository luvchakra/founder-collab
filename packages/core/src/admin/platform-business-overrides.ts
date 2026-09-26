import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { RESOURCE_KEYS } from "../entitlements/resource-keys";
import { isOverrideActive } from "../entitlements/business-override";
import { listAllUsers } from "./queries";

/**
 * PLATFORM-P1-02.1/02.2/02.3 ("Business-Level Exceptions", §24) -- the admin side of
 * `platform.business_overrides`. Every write is one of two SECURITY DEFINER functions
 * (`create_business_override` / `revoke_business_override`) that re-check superadmin,
 * require a reason, and write platform.audit_log (02.3). 02.2's four mandatory fields --
 * reason, created_by, start, expiry -- are enforced here (Zod) and again by the table's own
 * NOT NULL/CHECK constraints; created_by is always the signed-in superadmin (auth.uid()),
 * never a value the form supplies.
 */

export type BusinessOverride = {
  id: string;
  businessId: string;
  businessName: string;
  overrideType: "feature" | "limit";
  target: string;
  limitValue: number | null;
  reason: string;
  createdBy: string;
  createdByLabel: string;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  status: "scheduled" | "active" | "expired" | "revoked";
};

type Row = {
  id: string;
  business_id: string;
  override_type: "feature" | "limit";
  module_key: string | null;
  feature_key: string | null;
  resource_key: string | null;
  limit_value: number | null;
  reason: string;
  created_by: string;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
};

/** Pure: where an override sits in its lifecycle at `now`. */
export function overrideStatus(row: Pick<Row, "starts_at" | "expires_at" | "revoked_at">, now: Date = new Date()): BusinessOverride["status"] {
  if (row.revoked_at) return "revoked";
  if (isOverrideActive(row, now)) return "active";
  return new Date(row.starts_at) > now ? "scheduled" : "expired";
}

export async function listBusinessOverrides(): Promise<BusinessOverride[]> {
  await requireSuperadmin();
  const platform = await createClient({ schema: "platform" });
  const { data, error } = await platform.from("business_overrides").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const core = createAdminClient({ schema: "core" });
  const { data: businesses, error: businessError } = await core
    .from("businesses")
    .select("id, name")
    .in("id", [...new Set(rows.map((r) => r.business_id))]);
  if (businessError) throw businessError;
  const nameById = new Map(((businesses ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const users = await listAllUsers();
  const userLabel = new Map(users.map((u) => [u.id, u.full_name || u.email || u.id]));

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    businessName: nameById.get(r.business_id) ?? "Unknown business",
    overrideType: r.override_type,
    target: r.override_type === "feature" ? `${r.module_key}.${r.feature_key}` : (r.resource_key ?? ""),
    limitValue: r.limit_value,
    reason: r.reason,
    createdBy: r.created_by,
    createdByLabel: userLabel.get(r.created_by) ?? r.created_by,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    revokeReason: r.revoke_reason,
    status: overrideStatus(r),
  }));
}

/** Businesses a superadmin can pick when granting an override. */
export async function listOverrideBusinessOptions(): Promise<{ id: string; name: string }[]> {
  await requireSuperadmin();
  const core = createAdminClient({ schema: "core" });
  const { data, error } = await core.from("businesses").select("id, name").order("name").limit(1000);
  if (error) throw error;
  return (data ?? []) as { id: string; name: string }[];
}

const MAX_OVERRIDE_DAYS = 366;

export const createBusinessOverrideSchema = z
  .object({
    businessId: z.string().uuid("Choose a business."),
    overrideType: z.enum(["feature", "limit"]),
    /** "module.feature" for a feature override. */
    feature: z.string().trim().optional(),
    resourceKey: z.enum(RESOURCE_KEYS).optional(),
    /** Blank = unlimited. */
    limitValue: z
      .union([z.literal(""), z.coerce.number().int().min(0)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    startsAt: z.string().trim().optional(),
    expiresAt: z.string().trim().min(1, "An expiry is required."),
    reason: z.string().trim().min(1, "A reason is required.").max(500),
  })
  .superRefine((v, ctx) => {
    if (v.overrideType === "feature" && !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(v.feature ?? "")) {
      ctx.addIssue({ code: "custom", path: ["feature"], message: "Choose a feature." });
    }
    if (v.overrideType === "limit" && !v.resourceKey) {
      ctx.addIssue({ code: "custom", path: ["resourceKey"], message: "Choose a limit." });
    }
    const start = v.startsAt ? new Date(v.startsAt) : new Date();
    const end = new Date(v.expiresAt);
    if (Number.isNaN(start.getTime())) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "Invalid start." });
    if (Number.isNaN(end.getTime())) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Invalid expiry." });
      return;
    }
    if (end <= start) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after the start." });
    if (end.getTime() - start.getTime() > MAX_OVERRIDE_DAYS * 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: `An exception can last at most ${MAX_OVERRIDE_DAYS} days.` });
    }
  });

export type CreateBusinessOverrideInput = z.input<typeof createBusinessOverrideSchema>;

export async function createBusinessOverride(input: CreateBusinessOverrideInput): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  const parsed = createBusinessOverrideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid override." };
  const d = parsed.data;
  const [moduleKey, featureKey] = d.overrideType === "feature" ? (d.feature ?? "").split(".") : [null, null];
  const platform = await createClient({ schema: "platform" });
  const { error } = await platform.rpc("create_business_override", {
    p_business_id: d.businessId,
    p_override_type: d.overrideType,
    p_module_key: moduleKey,
    p_feature_key: featureKey,
    p_resource_key: d.overrideType === "limit" ? d.resourceKey : null,
    p_limit_value: d.overrideType === "limit" ? d.limitValue : null,
    p_starts_at: d.startsAt ? new Date(d.startsAt).toISOString() : null,
    p_expires_at: new Date(d.expiresAt).toISOString(),
    p_reason: d.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revokeBusinessOverride(id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperadmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown override." };
  if (!reason.trim()) return { ok: false, error: "A reason is required." };
  const platform = await createClient({ schema: "platform" });
  const { error } = await platform.rpc("revoke_business_override", { p_id: id, p_reason: reason.trim() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
