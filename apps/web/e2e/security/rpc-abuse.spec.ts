import { expect, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { adminClient, loadTenants } from "../support/tenants";
import { as } from "./support";

/**
 * SECURITY DEFINER functions bypass RLS by design, so each must check membership itself
 * (E2E_TEST_PLAN.md §SEC-RPC, closing coverage gap G-15). Every function below is
 * executable by `authenticated` and takes a business id; owner A calls each one against
 * tenant B, and the database is then checked with the service role for any effect.
 * Invoker-rights functions that return B's data are attacked too (they must answer empty).
 */

const refused = (r: { data: unknown; error: unknown }) =>
  r.error !== null || r.data === null || r.data === false || (Array.isArray(r.data) && r.data.length === 0);

test.describe("SEC-RPC tenant-scoped functions refuse a foreign business", () => {
  test("create_role cannot mint a role inside tenant B", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    const r = await a.rpc("create_role", { p_business_id: t.businesses.B.id, p_name: "e2e-qa rpc role", p_description: "", p_permission_keys: ["business.view"], p_template_key: null });
    expect(refused(r), JSON.stringify(r.data)).toBe(true);
    const { count } = await adminClient("core").from("roles").select("*", { count: "exact", head: true }).eq("business_id", t.businesses.B.id).eq("name", "e2e-qa rpc role");
    expect(count).toBe(0);
  });

  test("invite_member cannot invite anyone (e.g. the attacker) into tenant B", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    const { data: owner } = await adminClient("core").from("roles").select("id").is("business_id", null).eq("key", "owner").single();
    const r = await a.rpc("invite_member", {
      p_business_id: t.businesses.B.id,
      p_email: t.users.ownerA.email,
      p_invited_name: "e2e-qa",
      p_role_id: owner!.id,
      p_message: null,
      p_token_hash: randomBytes(32).toString("hex"),
      p_expires_at: new Date(Date.now() + 86400_000).toISOString(),
    });
    expect(refused(r), JSON.stringify(r.data)).toBe(true);
    const { count } = await adminClient("core").from("business_invitations").select("*", { count: "exact", head: true }).eq("business_id", t.businesses.B.id);
    expect(count).toBe(0);
  });

  test("transfer_ownership cannot be invoked on tenant B", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    const { data: bOwner } = await adminClient("core").from("business_members").select("id").eq("business_id", t.businesses.B.id).eq("user_id", t.users.ownerB.id).single();
    const r = await a.rpc("transfer_ownership", { p_business_id: t.businesses.B.id, p_member_id: bOwner!.id });
    expect(refused(r), JSON.stringify(r.data)).toBe(true);
    const { data: after } = await adminClient("core").from("business_members").select("role").eq("id", bOwner!.id).single();
    expect(after?.role).toBe("owner");
  });

  test("usage counters of tenant B cannot be consumed or inflated (quota exhaustion)", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    const period = new Date().toISOString().slice(0, 7);
    const before = await adminClient("core").from("usage_counters").select("*").eq("business_id", t.businesses.B.id);
    const r1 = await a.rpc("try_consume_usage_counter", { p_business_id: t.businesses.B.id, p_resource_key: "ai_runs", p_quantity: 1000, p_period: period });
    const r2 = await a.rpc("increment_usage_counter", { p_business_id: t.businesses.B.id, p_resource_key: "ai_runs", p_delta: 1000, p_period: period });
    expect(r1.error !== null || r1.data === false || r1.data === null, `try_consume -> ${JSON.stringify(r1.data)}`).toBe(true);
    expect(r2.error, "increment_usage_counter on a foreign business").not.toBeNull();
    const after = await adminClient("core").from("usage_counters").select("*").eq("business_id", t.businesses.B.id);
    expect(after.data).toEqual(before.data);
  });

  test("parked events of tenant B cannot be replayed", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    const r = await a.rpc("replay_parked_events", { p_business_id: t.businesses.B.id, p_module: "gst" });
    expect(r.error !== null || r.data === 0 || r.data === null, JSON.stringify(r.data)).toBe(true);
  });

  test("audit entries cannot be forged into tenant B or attributed to someone else", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("core");
    await a.rpc("write_audit_log", {
      p_business_id: t.businesses.B.id,
      p_actor_id: t.users.ownerB.id,
      p_action: "e2e-qa.forged",
      p_entity_type: "business",
      p_entity_id: t.businesses.B.id,
      p_before: null,
      p_after: null,
    });
    // In its own business, the recorded actor must be the caller, not whoever it names.
    await a.rpc("write_audit_log", {
      p_business_id: t.businesses.A.id,
      p_actor_id: t.users.ownerB.id,
      p_action: "e2e-qa.impersonated",
      p_entity_type: "business",
      p_entity_id: t.businesses.A.id,
      p_before: null,
      p_after: null,
    });
    const audit = adminClient("core").from("audit_log");
    const forged = await audit.select("*", { count: "exact", head: true }).eq("business_id", t.businesses.B.id).eq("action", "e2e-qa.forged");
    expect(forged.count, "forged entry in tenant B").toBe(0);
    const { data: own } = await adminClient("core").from("audit_log").select("actor_id").eq("business_id", t.businesses.A.id).eq("action", "e2e-qa.impersonated");
    for (const row of own ?? []) expect(row.actor_id, "entry attributed to another user").not.toBe(t.users.ownerB.id);
  });

  test("stock of tenant B cannot be adjusted through the contract RPC", async () => {
    const t = loadTenants();
    const a = (await as("ownerA")).schema("inventory");
    const r = await a.rpc("adjust_stock_for_contract", {
      _business_id: t.businesses.B.id,
      _item_id: t.b.itemId,
      _warehouse_id: randomUUID(),
      _movement_type: "adjustment",
      _quantity: 5,
      _reference: "e2e-qa forged",
    });
    expect(refused(r), JSON.stringify(r.data)).toBe(true);
  });

  test("Finance report functions return nothing of tenant B", async () => {
    const t = loadTenants();
    const g = (await as("ownerA")).schema("gst");
    const span = { p_business_id: t.businesses.B.id, p_from: "2000-01-01", p_to: "2100-01-01" };
    for (const fn of ["account_period_totals", "account_statement_totals", "cash_flow_totals", "sales_by_item", "sales_by_party", "purchases_by_party"]) {
      const r = await g.rpc(fn, span);
      expect(refused(r), `${fn} -> ${JSON.stringify(r.data)?.slice(0, 200)}`).toBe(true);
    }
    const dim = await g.rpc("dimension_totals", { ...span, p_dimension: "project" });
    expect(refused(dim), JSON.stringify(dim.data)?.slice(0, 200)).toBe(true);
  });
});
