import { createAdminClient } from "../db/admin";
import { requireSuperadmin } from "../rbac/platform-admin";

/**
 * PLATFORM-P1-10.11 (Environment Console): counts and recent load for one business (one
 * environment), for the vendor console. Counts only, every query filtered by that one
 * business_id, read with the service role after requireSuperadmin(). A count that can't be
 * read is null -- the page says "Unavailable", never 0.
 */
export type EnvironmentStats = {
  members: number | null;
  licensedModules: number | null;
  offerings: number | null;
  parties: number | null;
  documents: number | null;
  payments: number | null;
  aiRuns30d: number | null;
  lastActivityAt: string | null | undefined;
};

export async function getEnvironmentStats(businessId: string, now: number = Date.now()): Promise<EnvironmentStats> {
  await requireSuperadmin();
  const core = createAdminClient({ schema: "core" });
  const discovery = createAdminClient({ schema: "discovery" });
  const since = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? null : (n ?? 0);
  };
  const [members, licensedModules, offerings, parties, documents, payments, aiRuns30d, last] = await Promise.all([
    count(core.from("business_members").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "active")),
    count(core.from("licenses").select("id", { count: "exact", head: true }).eq("business_id", businessId).in("status", ["active", "grace"])),
    count(discovery.from("products").select("id", { count: "exact", head: true }).eq("business_id", businessId)),
    count(core.from("parties").select("id", { count: "exact", head: true }).eq("business_id", businessId)),
    count(core.from("documents").select("id", { count: "exact", head: true }).eq("business_id", businessId)),
    count(core.from("payments").select("id", { count: "exact", head: true }).eq("business_id", businessId)),
    count(core.from("ai_runs").select("id", { count: "exact", head: true }).eq("business_id", businessId).gte("created_at", since)),
    core.from("audit_log").select("created_at").eq("business_id", businessId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    members,
    licensedModules,
    offerings,
    parties,
    documents,
    payments,
    aiRuns30d,
    // undefined = couldn't read; null = nothing recorded yet.
    lastActivityAt: last.error ? undefined : ((last.data?.created_at as string | undefined) ?? null),
  };
}
