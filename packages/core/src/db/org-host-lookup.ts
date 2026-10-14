import { createAdminClient } from "./admin";

/**
 * PLATFORM-P1-10.1: does a business live at this address label? Used by the proxy on every
 * request to an organization's address, so the answer is cached per label for 30 seconds --
 * only "found or not", never the business's data, and a failed lookup is never cached (it
 * answers 503, never a fallback to another business).
 *
 * Service role, because the visitor may be signed out and clients have no access to the core
 * schema before sign-in; core.resolve_business_host() returns only the public face and never
 * authorizes anything.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { found: boolean; at: number }>();

export type HostLookup = "found" | "missing" | "error";

export async function lookUpOrgHost(label: string, now: number = Date.now()): Promise<HostLookup> {
  const hit = cache.get(label);
  if (hit && now - hit.at < TTL_MS) return hit.found ? "found" : "missing";
  try {
    const { data, error } = await createAdminClient({ schema: "core" }).rpc("resolve_business_host", { p_label: label });
    if (error) return "error";
    const found = Array.isArray(data) && data.length > 0;
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(label, { found, at: now });
    return found ? "found" : "missing";
  } catch {
    return "error";
  }
}

export type HostBusiness = { businessId: string; name: string; slug: string; status: "active" | "suspended" | "decommissioned" };

/** The public face of the business at an address, uncached: for the sign-in gate and pages
 * that need its name or status. Null when nothing lives there; throws when the lookup fails. */
export async function resolveOrgHost(label: string): Promise<HostBusiness | null> {
  const { data, error } = await createAdminClient({ schema: "core" }).rpc("resolve_business_host", { p_label: label });
  if (error) throw error;
  const row = (data as { business_id: string; name: string; slug: string; status: HostBusiness["status"] }[] | null)?.[0];
  return row ? { businessId: row.business_id, name: row.name, slug: row.slug, status: row.status } : null;
}

/** Test seam. */
export function clearOrgHostCache(): void {
  cache.clear();
}
