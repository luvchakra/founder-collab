import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, loadTenants, userClient, type QaTenants, type QaUserKey } from "../support/tenants";

export const TENANT_SCHEMAS = ["core", "discovery", "inventory", "fsm", "crm", "gst", "platform"] as const;

export type Relation = { schema: string; name: string; tenantColumn: "business_id" | "workspace_id" | null };

/** Every table/view PostgREST exposes, read from its own OpenAPI document with the
 * service role -- so a relation added by a future migration is swept automatically
 * instead of silently escaping a hand-maintained list. */
export async function listRelations(): Promise<Relation[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const out: Relation[] = [];
  for (const schema of TENANT_SCHEMAS) {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": schema } });
    if (!res.ok) throw new Error(`OpenAPI for ${schema}: HTTP ${res.status}`);
    const doc = (await res.json()) as { definitions?: Record<string, { properties?: Record<string, unknown> }> };
    for (const [name, def] of Object.entries(doc.definitions ?? {})) {
      const props = def.properties ?? {};
      const tenantColumn = "business_id" in props ? "business_id" : "workspace_id" in props ? "workspace_id" : null;
      out.push({ schema, name, tenantColumn });
    }
  }
  return out;
}

const sessions = new Map<QaUserKey, SupabaseClient>();

/** One signed-in client per seeded user, reused across tests in a worker. */
export async function as(user: QaUserKey): Promise<SupabaseClient> {
  const cached = sessions.get(user);
  if (cached) return cached;
  const t = loadTenants();
  const { client } = await userClient(t.users[user].email, t.password);
  sessions.set(user, client);
  return client;
}

/** The business and workspace ids `user` may legitimately see -- the allow-list every
 * swept row's tenant column is checked against. Read with the service role from the
 * membership tables, never from what the user's own session reports. */
export async function allowedTenantIds(t: QaTenants, user: QaUserKey): Promise<{ businesses: Set<string>; workspaces: Set<string> }> {
  const core = adminClient("core");
  const { data: members } = await core.from("business_members").select("business_id").eq("user_id", t.users[user].id).eq("status", "active");
  const businesses = new Set((members ?? []).map((m) => m.business_id as string));
  const workspaces = new Set<string>();
  if (businesses.size > 0) {
    const { data: products } = await adminClient("discovery").from("products").select("id").in("business_id", [...businesses]);
    const productIds = (products ?? []).map((p) => p.id as string);
    if (productIds.length > 0) {
      const { data: ws } = await adminClient("discovery").from("workspaces").select("id").in("product_id", productIds);
      for (const w of ws ?? []) workspaces.add(w.id as string);
    }
  }
  return { businesses, workspaces };
}

/** Reads only the tenant column of up to 1000 rows -- enough to prove whether any row
 * from a foreign tenant is visible, without pulling that tenant's actual content. */
export async function visibleTenantIds(client: SupabaseClient, rel: Relation): Promise<{ ids: string[]; error: string | null }> {
  if (!rel.tenantColumn) return { ids: [], error: null };
  const { data, error } = await client.schema(rel.schema).from(rel.name).select(rel.tenantColumn).limit(1000);
  if (error) return { ids: [], error: `${error.code ?? ""} ${error.message}`.trim() };
  return { ids: (data ?? []).map((r) => (r as Record<string, string | null>)[rel.tenantColumn!]).filter((v): v is string => Boolean(v)), error: null };
}

/** Row count visible to `client` (no content read). */
export async function visibleCount(client: SupabaseClient, schema: string, name: string): Promise<{ count: number; error: string | null }> {
  const { count, error } = await client.schema(schema).from(name).select("*", { count: "exact", head: true });
  if (error) return { count: 0, error: `${error.code ?? ""} ${error.message}`.trim() };
  return { count: count ?? 0, error: null };
}
