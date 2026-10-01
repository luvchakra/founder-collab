import { expect, test } from "@playwright/test";
import { adminClient, anonClient, loadTenants, type QaUserKey } from "../support/tenants";
import { allowedTenantIds, as, listRelations, visibleCount, visibleTenantIds, type Relation } from "./support";

/**
 * Cross-tenant isolation, proven at the API layer (E2E_TEST_PLAN.md §SEC-TI). Each test
 * talks to PostgREST directly with a real user's JWT -- the same requests a browser
 * session makes, minus every UI-side filter -- so nothing here can pass merely because
 * a page happened not to render a link.
 *
 * Any failure in this file is a P0 (cross-tenant data exposure) until proven otherwise.
 */

let relations: Relation[] = [];
test.beforeAll(async () => {
  relations = await listRelations();
});

for (const user of ["ownerA", "viewerA", "invMgrA", "ownerB", "outsider"] as const satisfies readonly QaUserKey[]) {
  test(`SEC-TI-01 ${user} sees no foreign tenant's row in any business/workspace-scoped relation`, async () => {
    test.setTimeout(240_000);
    const t = loadTenants();
    const client = await as(user);
    const allowed = await allowedTenantIds(t, user);
    const leaks: string[] = [];
    let swept = 0;
    for (const rel of relations.filter((r) => r.tenantColumn)) {
      const { ids, error } = await visibleTenantIds(client, rel);
      if (error) continue; // a permission error is a denial, not a leak
      swept++;
      const allowSet = rel.tenantColumn === "business_id" ? allowed.businesses : allowed.workspaces;
      const foreign = new Set(ids.filter((id) => !allowSet.has(id)));
      if (foreign.size > 0) leaks.push(`${rel.schema}.${rel.name}: ${foreign.size} foreign ${rel.tenantColumn}(s)`);
    }
    expect(swept, "the sweep actually queried relations").toBeGreaterThan(50);
    expect(leaks, "relations exposing another tenant's rows").toEqual([]);
  });
}

test("SEC-TI-02 the anonymous role reads no tenant data from any relation", async () => {
  test.setTimeout(240_000);
  const anon = anonClient();
  const exposed: string[] = [];
  for (const rel of relations.filter((r) => r.tenantColumn)) {
    const { count, error } = await visibleCount(anon, rel.schema, rel.name);
    if (!error && count > 0) exposed.push(`${rel.schema}.${rel.name} (${count})`);
  }
  expect(exposed).toEqual([]);
});

test.describe("SEC-TI-03 object-id substitution against tenant B's records (as tenant A's owner)", () => {
  const targets = () => {
    const t = loadTenants();
    return [
      { schema: "core", table: "parties", id: t.b.partyId, patch: { name: "pwned" } },
      { schema: "core", table: "items", id: t.b.itemId, patch: { name: "pwned" } },
      { schema: "core", table: "documents", id: t.b.documentId, patch: { status: "void" } },
      { schema: "discovery", table: "products", id: t.b.productId, patch: { name: "pwned" } },
      { schema: "discovery", table: "prospects", id: t.b.prospectId, patch: { company_name: "pwned" } },
      { schema: "fsm", table: "jobs", id: t.b.jobId, patch: { description: "pwned" } },
    ];
  };

  test("read by id returns nothing", async () => {
    const a = await as("ownerA");
    for (const target of targets()) {
      const { data } = await a.schema(target.schema).from(target.table).select("id").eq("id", target.id);
      expect(data ?? [], `${target.schema}.${target.table}`).toHaveLength(0);
    }
  });

  test("update by id changes nothing", async () => {
    const a = await as("ownerA");
    for (const target of targets()) {
      const { data } = await a.schema(target.schema).from(target.table).update(target.patch).eq("id", target.id).select("id");
      expect(data ?? [], `${target.schema}.${target.table} update`).toHaveLength(0);
      const { data: after } = await adminClient(target.schema).from(target.table).select("*").eq("id", target.id).single();
      for (const [k, v] of Object.entries(target.patch)) expect(after?.[k], `${target.schema}.${target.table}.${k} unchanged`).not.toBe(v);
    }
  });

  test("delete by id removes nothing", async () => {
    const a = await as("ownerA");
    for (const target of targets()) {
      await a.schema(target.schema).from(target.table).delete().eq("id", target.id);
      const { data } = await adminClient(target.schema).from(target.table).select("id").eq("id", target.id);
      expect(data ?? [], `${target.schema}.${target.table} still exists`).toHaveLength(1);
    }
  });

  test("insert into tenant B (forged business_id / workspace_id) is rejected", async () => {
    const t = loadTenants();
    const a = await as("ownerA");
    const attempts = [
      a.schema("core").from("parties").insert({ business_id: t.businesses.B.id, name: "e2e-qa forged" }),
      a.schema("core").from("items").insert({ business_id: t.businesses.B.id, name: "e2e-qa forged" }),
      a.schema("discovery").from("products").insert({ business_id: t.businesses.B.id, name: "e2e-qa forged" }),
      a.schema("discovery").from("prospects").insert({ workspace_id: t.b.workspaceId, company_name: "e2e-qa forged" }),
      a.schema("fsm").from("jobs").insert({ business_id: t.businesses.B.id, party_id: t.b.partyId }),
      // Re-pointing one of A's own rows at tenant B must fail too.
      a.schema("core").from("parties").update({ business_id: t.businesses.B.id }).eq("id", t.a.partyId).select("id"),
    ];
    for (const [i, attempt] of attempts.entries()) {
      const { data, error } = await attempt;
      expect(error !== null || (Array.isArray(data) && data.length === 0), `attempt #${i} must be refused`).toBe(true);
    }
    const { count } = await adminClient("core").from("parties").select("id", { count: "exact", head: true }).eq("business_id", t.businesses.B.id).eq("name", "e2e-qa forged");
    expect(count).toBe(0);
  });

  test("filter / query-parameter manipulation cannot widen the result", async () => {
    const t = loadTenants();
    const a = await as("ownerA");
    const { data: orFilter } = await a.schema("core").from("parties").select("business_id").or(`business_id.eq.${t.businesses.B.id},business_id.eq.${t.businesses.A.id}`);
    expect((orFilter ?? []).every((r) => r.business_id !== t.businesses.B.id)).toBe(true);
    const { data: inFilter } = await a.schema("core").from("parties").select("business_id").in("business_id", [t.businesses.B.id]);
    expect(inFilter ?? []).toHaveLength(0);
    const { data: search } = await a.schema("core").from("parties").select("id").ilike("name", "%e2e-qa B Customer%");
    expect(search ?? []).toHaveLength(0);
  });
});

test.describe("SEC-TI-04 tenant-scoped RPCs refuse a foreign business", () => {
  test("permission and role lookups answer false/empty for tenant B", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    expect((await a.rpc("has_permission", { p_business_id: t.businesses.B.id, p_key: "parties.view" })).data).toBe(false);
    const eff = await a.rpc("effective_permissions", { p_business_id: t.businesses.B.id });
    expect(eff.data ?? []).toHaveLength(0);
    const access = await a.rpc("my_business_access");
    const ids = ((access.data ?? []) as { business_id: string }[]).map((r) => r.business_id);
    expect(ids).toContain(t.businesses.A.id);
    expect(ids).not.toContain(t.businesses.B.id);
  });

  test("numbering cannot be consumed in tenant B's sequence", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    const { data, error } = await a.rpc("next_number", { p_business_id: t.businesses.B.id, p_scope: "invoice", p_prefix: "INV" });
    expect(error !== null || data === null, `next_number for B returned ${JSON.stringify(data)}`).toBe(true);
  });
});
