import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { requireSuperadmin } from "../rbac/platform-admin";
import { toApiPolicy, type ApiPolicy } from "../api-v1/policy";

/**
 * PLATFORM-P1-06.1/06.2/06.3/06.4 ("Platform API Administration", §28) -- the admin side.
 * Policy writes go through platform.update_api_policies() (reason required, audited in
 * platform.audit_log); the per-minute limit stays on Platform Policies (PLATFORM-P0-14.3).
 * API keys stay core.api_keys: superadmins see metadata only -- name, prefix, permissions,
 * last use -- never a key or its hash (core.api_key_secrets is not read here at all).
 */

type Result = { ok: true } | { ok: false; error: string };

export async function getApiPolicy(): Promise<ApiPolicy & { updatedAt: string | null }> {
  await requireSuperadmin();
  const platform = await createClient({ schema: "platform" });
  const [policy, system] = await Promise.all([
    platform.from("api_policies").select("*").eq("id", true).maybeSingle(),
    platform.from("system_policies").select("rate_limit_api_per_minute").eq("id", true).maybeSingle(),
  ]);
  if (policy.error) throw policy.error;
  if (system.error) throw system.error;
  return {
    ...toApiPolicy(policy.data as Record<string, unknown> | null, system.data as Record<string, unknown> | null),
    updatedAt: (policy.data?.updated_at as string | undefined) ?? null,
  };
}

export const updateApiPolicySchema = z.object({
  burstLimitPerSecond: z.coerce.number().int().min(1).max(1000),
  maxPayloadKb: z.coerce.number().int().min(1).max(10240),
  webhookMaxRetries: z.coerce.number().int().min(0).max(20),
  webhookTimeoutSeconds: z.coerce.number().int().min(60).max(86400),
  webhookSignatureToleranceSeconds: z.coerce.number().int().min(30).max(3600),
  reason: z.string().trim().min(1, "A reason is required.").max(500),
});
export type UpdateApiPolicyInput = z.input<typeof updateApiPolicySchema>;

export async function updateApiPolicy(input: UpdateApiPolicyInput): Promise<Result> {
  await requireSuperadmin();
  const parsed = updateApiPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid policy." };
  const d = parsed.data;
  const platform = await createClient({ schema: "platform" });
  const { error } = await platform.rpc("update_api_policies", {
    p_burst_limit_per_second: d.burstLimitPerSecond,
    p_max_payload_kb: d.maxPayloadKb,
    p_webhook_max_retries: d.webhookMaxRetries,
    p_webhook_timeout_seconds: d.webhookTimeoutSeconds,
    p_webhook_signature_tolerance_seconds: d.webhookSignatureToleranceSeconds,
    p_reason: d.reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type PlatformApiKey = {
  id: string;
  businessId: string;
  businessName: string;
  name: string;
  keyPrefix: string;
  permissionCount: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

async function businessNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await createAdminClient({ schema: "core" }).from("businesses").select("id, name").in("id", ids);
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
}

/** PLATFORM-P1-06.2 -- every business's API keys (metadata only), newest first. */
export async function listPlatformApiKeys(): Promise<PlatformApiKey[]> {
  await requireSuperadmin();
  const { data, error } = await createAdminClient({ schema: "core" })
    .from("api_keys")
    .select("id, business_id, name, key_prefix, permissions, last_used_at, revoked_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as {
    id: string;
    business_id: string;
    name: string;
    key_prefix: string;
    permissions: string[] | null;
    last_used_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }[];
  const names = await businessNames([...new Set(rows.map((r) => r.business_id))]);
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    businessName: names.get(r.business_id) ?? "Unknown business",
    name: r.name,
    keyPrefix: r.key_prefix,
    permissionCount: r.permissions?.length ?? 0,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }));
}

export async function revokePlatformApiKey(id: string, reason: string): Promise<Result> {
  await requireSuperadmin();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown API key." };
  if (!reason.trim()) return { ok: false, error: "A reason is required." };
  const platform = await createClient({ schema: "platform" });
  const { error } = await platform.rpc("revoke_business_api_key", { p_key_id: id, p_reason: reason.trim() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type ApiUsageSummary = {
  requests24h: number;
  requests7d: number;
  rateLimited7d: number;
  errors24h: { clientErrors: number; serverErrors: number };
  errors7d: { clientErrors: number; serverErrors: number };
  errorsByStatus7d: { status: number; count: number }[];
  daily: { day: string; requests: number }[];
  topBusinesses: { businessId: string; businessName: string; requests: number }[];
  activeKeys: number;
  keysUsed7d: number;
};

type DailyRow = { day: string; business_id: string; requests: number; rate_limited: number };
type ErrorRow = { hour: string; status_code: number; error_count: number };

/** Pure: rolls the per-day, per-business rows and hourly error rows into the dashboard's
 * figures. `now` fixes "today" for tests. */
export function summarizeApiUsage(daily: DailyRow[], errors: ErrorRow[], now: Date = new Date()): Omit<ApiUsageSummary, "topBusinesses" | "activeKeys" | "keysUsed7d"> & { byBusiness: Map<string, number> } {
  const today = now.toISOString().slice(0, 10);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  const perDay = new Map(days.map((d) => [d, 0]));
  const byBusiness = new Map<string, number>();
  let requests7d = 0;
  let rateLimited7d = 0;
  for (const r of daily) {
    const n = Number(r.requests);
    requests7d += n;
    rateLimited7d += Number(r.rate_limited);
    if (perDay.has(r.day)) perDay.set(r.day, (perDay.get(r.day) ?? 0) + n);
    byBusiness.set(r.business_id, (byBusiness.get(r.business_id) ?? 0) + n);
  }
  const since24h = now.getTime() - 86_400_000;
  const errors24h = { clientErrors: 0, serverErrors: 0 };
  const errors7d = { clientErrors: 0, serverErrors: 0 };
  const byStatus = new Map<number, number>();
  for (const e of errors) {
    const bucket = e.status_code >= 500 ? "serverErrors" : "clientErrors";
    errors7d[bucket] += e.error_count;
    if (new Date(e.hour).getTime() >= since24h) errors24h[bucket] += e.error_count;
    byStatus.set(e.status_code, (byStatus.get(e.status_code) ?? 0) + e.error_count);
  }
  return {
    requests24h: perDay.get(today) ?? 0,
    requests7d,
    rateLimited7d,
    errors24h,
    errors7d,
    errorsByStatus7d: [...byStatus.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    daily: days.map((day) => ({ day, requests: perDay.get(day) ?? 0 })),
    byBusiness,
  };
}

/** PLATFORM-P1-06.4 -- aggregate platform API usage for the last seven days. */
export async function getApiUsageSummary(): Promise<ApiUsageSummary> {
  await requireSuperadmin();
  const platform = await createClient({ schema: "platform" });
  const core = createAdminClient({ schema: "core" });
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [daily, errors, activeKeys, usedKeys] = await Promise.all([
    platform.rpc("api_usage_daily", { p_days: 7 }),
    platform.from("api_error_counters").select("hour, status_code, error_count").gte("hour", since7d).limit(5000),
    core.from("api_keys").select("id", { count: "exact", head: true }).is("revoked_at", null),
    core.from("api_keys").select("id", { count: "exact", head: true }).gte("last_used_at", since7d),
  ]);
  if (daily.error) throw daily.error;
  if (errors.error) throw errors.error;
  if (activeKeys.error) throw activeKeys.error;
  if (usedKeys.error) throw usedKeys.error;
  const { byBusiness, ...rest } = summarizeApiUsage((daily.data ?? []) as DailyRow[], (errors.data ?? []) as ErrorRow[]);
  const top = [...byBusiness.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const names = await businessNames(top.map(([id]) => id));
  return {
    ...rest,
    topBusinesses: top.map(([businessId, requests]) => ({ businessId, businessName: names.get(businessId) ?? "Unknown business", requests })),
    activeKeys: activeKeys.count ?? 0,
    keysUsed7d: usedKeys.count ?? 0,
  };
}
