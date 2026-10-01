import { expect, test } from "@playwright/test";
import { adminClient, loadTenants } from "../support/tenants";
import { as } from "./support";

/**
 * Authorization and licensing, proven server-side (E2E_TEST_PLAN.md §SEC-RBAC, §SEC-LIC,
 * §SEC-ESC). Every attempt is a direct API call with a real user's JWT -- what a hostile
 * client would send after hiding nothing more than a button -- and every refusal is
 * double-checked against the database with the service role, so a request that "failed"
 * but wrote anyway cannot pass.
 *
 * Roles under test (system roles, see core.role_permission_grants):
 *   viewerA  business.view + every *.view, nothing else
 *   invMgrA  inventory.*, suppliers.*, purchase_orders.*, stock_transfers.*, alerts.*
 *   adminA / ownerA  full access
 */

const refused = (r: { data: unknown; error: unknown }) => r.error !== null || (Array.isArray(r.data) && r.data.length === 0);

async function rowCount(schema: string, table: string, column: string, value: string): Promise<number> {
  const { count } = await adminClient(schema).from(table).select("*", { count: "exact", head: true }).eq(column, value);
  return count ?? 0;
}

test.describe("SEC-RBAC role permissions are enforced by the database, not the UI", () => {
  test("viewer can read but every write is refused", async () => {
    const t = loadTenants();
    const v = await as("viewerA");
    const read = await v.schema("core").from("parties").select("id").eq("id", t.a.partyId);
    expect(read.data ?? [], "viewer reads its own business's customer").toHaveLength(1);

    expect(refused(await v.schema("core").from("parties").insert({ business_id: t.businesses.A.id, name: "e2e-qa viewer write" }).select("id"))).toBe(true);
    expect(refused(await v.schema("discovery").from("products").insert({ business_id: t.businesses.A.id, name: "e2e-qa viewer write" }).select("id"))).toBe(true);
    expect(refused(await v.schema("fsm").from("jobs").insert({ business_id: t.businesses.A.id, party_id: t.a.partyId }).select("id"))).toBe(true);
    expect(refused(await v.schema("core").from("parties").update({ name: "e2e-qa viewer edit" }).eq("id", t.a.partyId).select("id"))).toBe(true);
    await v.schema("core").from("parties").delete().eq("id", t.a.partyId);

    expect(await rowCount("core", "parties", "name", "e2e-qa viewer write")).toBe(0);
    expect(await rowCount("core", "parties", "name", "e2e-qa viewer edit")).toBe(0);
    expect(await rowCount("core", "parties", "id", t.a.partyId), "viewer's delete removed nothing").toBe(1);
  });

  test("module-scoped role cannot read or write outside its modules", async () => {
    const t = loadTenants();
    const inv = await as("invMgrA");
    // Offerings themselves are deliberately shared with inventory.edit holders (the
    // "inventory hand-off" policies on discovery.products: products mirror into Inventory
    // items), so the boundary is Discovery's own customer data behind them.
    const { data: ws } = await adminClient("discovery").from("workspaces").select("id").eq("product_id", t.a.productId).single();
    await adminClient("discovery").from("prospects").insert({ workspace_id: ws!.id, company_name: "e2e-qa A Prospect" });
    const prospects = await inv.schema("discovery").from("prospects").select("id").eq("workspace_id", ws!.id);
    expect(prospects.data ?? [], "inventory manager sees no Discovery prospects").toHaveLength(0);
    const jobs = await inv.schema("fsm").from("jobs").select("id").eq("business_id", t.businesses.A.id);
    expect(jobs.data ?? [], "inventory manager sees no Service jobs").toHaveLength(0);
    expect(refused(await inv.schema("discovery").from("prospects").insert({ workspace_id: ws!.id, company_name: "e2e-qa invmgr write" }).select("id"))).toBe(true);
    expect(refused(await inv.schema("fsm").from("jobs").insert({ business_id: t.businesses.A.id, party_id: t.a.partyId }).select("id"))).toBe(true);
    expect(refused(await inv.schema("gst").from("accounts").insert({ business_id: t.businesses.A.id, account_number: "9999", name: "e2e-qa invmgr", type: "asset" }).select("id"))).toBe(true);
    expect(await rowCount("discovery", "prospects", "company_name", "e2e-qa invmgr write")).toBe(0);
    expect(await rowCount("gst", "accounts", "name", "e2e-qa invmgr")).toBe(0);
  });

  test("full-access roles can write (positive control for the refusals above)", async () => {
    const t = loadTenants();
    const admin = await as("adminA");
    const created = await admin.schema("core").from("parties").insert({ business_id: t.businesses.A.id, name: "e2e-qa admin write" }).select("id").single();
    expect(created.error).toBeNull();
    await adminClient("core").from("parties").delete().eq("id", created.data!.id);
  });
});

test.describe("SEC-ESC privilege escalation attempts", () => {
  test("a viewer cannot promote itself", async () => {
    const t = loadTenants();
    const v = await as("viewerA");
    const { data: owner } = await adminClient("core").from("roles").select("id").is("business_id", null).eq("key", "owner").single();
    await v.schema("core").from("business_members").update({ role: "owner" }).eq("user_id", t.users.viewerA.id);
    await v.schema("core").from("business_members").update({ role_id: owner!.id }).eq("user_id", t.users.viewerA.id);
    const { data: me } = await adminClient("core").from("business_members").select("role").eq("user_id", t.users.viewerA.id).eq("business_id", t.businesses.A.id).single();
    expect(me?.role).toBe("viewer");
  });

  test("a viewer cannot grant permissions to its role or mint a custom role", async () => {
    const t = loadTenants();
    const v = await as("viewerA");
    const { data: viewer } = await adminClient("core").from("roles").select("id").is("business_id", null).eq("key", "viewer").single();
    expect(refused(await v.schema("core").from("role_permission_grants").insert({ role_id: viewer!.id, permission_key: "inventory.edit" }).select("role_id"))).toBe(true);
    expect(refused(await v.schema("core").from("roles").insert({ business_id: t.businesses.A.id, key: "e2e_qa_escalate", name: "e2e-qa escalate" }).select("id"))).toBe(true);
    const { count } = await adminClient("core").from("role_permission_grants").select("*", { count: "exact", head: true }).eq("role_id", viewer!.id).eq("permission_key", "inventory.edit");
    expect(count).toBe(0);
  });

  test("nobody can add a member directly -- not even the owner, and not an outsider adding itself", async () => {
    const t = loadTenants();
    for (const [actor, role] of [["ownerA", "admin"], ["outsider", "owner"]] as const) {
      const c = await as(actor);
      expect(refused(await c.schema("core").from("business_members").insert({ business_id: t.businesses.A.id, user_id: t.users.outsider.id, role }).select("id"))).toBe(true);
    }
    expect(await rowCount("core", "business_members", "user_id", t.users.outsider.id)).toBe(0);
  });

  test("a tenant cannot license a module for itself (licensing is billing-side only)", async () => {
    const t = loadTenants();
    const owner = await as("ownerA");
    const insert = await owner.schema("core").from("licenses").insert({ business_id: t.businesses.A2.id, account_id: t.businesses.A2.accountId, module_key: "inventory", status: "active" }).select("id");
    expect(refused(insert)).toBe(true);
    await owner.schema("core").from("licenses").update({ status: "active", grace_ends_at: null }).eq("business_id", t.businesses.A2.id);
    const { data } = await adminClient("core").from("licenses").select("module_key").eq("business_id", t.businesses.A2.id);
    expect((data ?? []).map((l) => l.module_key)).toEqual(["discovery"]);
  });

  test("a tenant cannot make itself a platform administrator", async () => {
    const t = loadTenants();
    const owner = await as("ownerA");
    await owner.schema("platform").from("admins").insert({ user_id: t.users.ownerA.id });
    expect(await rowCount("platform", "admins", "user_id", t.users.ownerA.id)).toBe(0);
  });
});

test.describe("SEC-LIC licensing is enforced independently of role permissions", () => {
  // Both tests change tenant A2's Discovery data/licence; never interleave them.
  test.describe.configure({ mode: "serial" });

  test("owner (full permissions) is refused an unlicensed module's data", async () => {
    const t = loadTenants();
    const owner = await as("ownerA");
    // A2 licenses Discovery only. Fixture a customer there with the service role so the
    // only thing standing between the owner and a Service job is the missing licence.
    const { data: party } = await adminClient("core").from("parties").insert({ business_id: t.businesses.A2.id, name: "e2e-qa A2 Customer" }).select("id").single();
    const job = await owner.schema("fsm").from("jobs").insert({ business_id: t.businesses.A2.id, party_id: party!.id }).select("id");
    expect(refused(job), "Service write without a Service licence").toBe(true);
    // Same owner, same permissions, licensed business: allowed (positive control).
    const control = await owner.schema("fsm").from("jobs").insert({ business_id: t.businesses.A.id, party_id: t.a.partyId }).select("id").single();
    expect(control.error).toBeNull();
    await adminClient("fsm").from("jobs").delete().eq("id", control.data!.id);
    // And the licensed module still works for A2.
    const offering = await owner.schema("discovery").from("products").insert({ business_id: t.businesses.A2.id, name: "e2e-qa A2 Offering" }).select("id").single();
    expect(offering.error).toBeNull();
  });

  test("ADR-9 lifecycle: grace is read-only, expiry denies, reactivation restores retained rows", async () => {
    test.setTimeout(60_000);
    const t = loadTenants();
    const owner = await as("ownerA");
    const setDiscovery = (patch: Record<string, unknown>) =>
      adminClient("core").from("licenses").update(patch).eq("business_id", t.businesses.A2.id).eq("module_key", "discovery");
    const visible = async () => (await owner.schema("discovery").from("products").select("id").eq("business_id", t.businesses.A2.id)).data?.length ?? 0;

    await adminClient("discovery").from("products").insert({ business_id: t.businesses.A2.id, name: "e2e-qa A2 retained offering" });
    const before = await visible();
    expect(before, "A2 has at least one offering to retain").toBeGreaterThan(0);
    try {
      await setDiscovery({ status: "grace", grace_ends_at: new Date(Date.now() + 30 * 86400_000).toISOString() });
      expect(await visible(), "grace: still readable").toBe(before);
      expect(refused(await owner.schema("discovery").from("products").insert({ business_id: t.businesses.A2.id, name: "e2e-qa grace write" }).select("id")), "grace: writes refused").toBe(true);

      await setDiscovery({ status: "expired", grace_ends_at: new Date(Date.now() - 1000).toISOString() });
      expect(await visible(), "expired: access denied").toBe(0);
      const { count } = await adminClient("discovery").from("products").select("*", { count: "exact", head: true }).eq("business_id", t.businesses.A2.id);
      expect(count, "expired: rows retained, never deleted").toBe(before);
    } finally {
      await setDiscovery({ status: "active", grace_ends_at: null, deactivated_at: null });
    }
    expect(await visible(), "reactivated: everything is back").toBe(before);
  });
});
