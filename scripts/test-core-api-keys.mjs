#!/usr/bin/env node
/**
 * RLS + behavior test for core.api_keys/core.api_key_secrets/core.api_rate_limit_counters
 * and their two service-role-only helper functions (core.check_api_rate_limit(),
 * core.next_number_for_api()), promoted from stockpilot-ai-ops's public API v1
 * (SP-7's own "promote public_api_v1 + api-v1 lib to core"), via the shared harness
 * (C-8). Covers: settings.manage-gated create/read/revoke, that api_key_secrets has no
 * SELECT policy at all (not even for the key's own creator), tenant isolation, and that
 * the two new service-role-only functions are unreachable for an ordinary authenticated
 * caller but work correctly for service_role -- including that next_number_for_api()
 * shares the exact same counter core.next_number() itself uses.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner -- has settings.manage
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer -- lacks settings.manage
const BOB = "22222222-2222-2222-2222-222222222222"; // owner of a separate business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_api_keys_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsService = (sql) => psql(`set local role service_role; ${sql}`);

      console.log("Seeding two businesses: Alice's (owner + viewer) and Bob's (owner)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${CAROL}', 'carol@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      const bobBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);
      psql(`
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${aliceBiz}';
        insert into core.business_members (business_id, user_id, role) values
          ('${aliceBiz}', '${ALICE}', 'owner'),
          ('${aliceBiz}', '${CAROL}', 'viewer'),
          ('${bobBiz}', '${BOB}', 'owner');
      `);

      console.log("Verifying settings.manage-gated create...");
      const keyId = psqlAsAlice(`
        insert into core.api_keys (business_id, name, key_prefix, permissions)
        values ('${aliceBiz}', 'Zapier', 'sk_live_ab12', array['inventory.view', 'inventory.edit'])
        returning id;
      `);
      psqlAsAlice(`insert into core.api_key_secrets (api_key_id, key_hash) values ('${keyId}', 'deadbeef');`);
      assertThrows(
        () => psqlAsCarol(`insert into core.api_keys (business_id, name, key_prefix) values ('${aliceBiz}', 'Carol''s key', 'sk_live_cc00')`),
        "a viewer (no settings.manage) cannot create an API key",
      );

      console.log("Verifying settings.manage-gated read...");
      assertEqual(psqlAsAlice(`select count(*) from core.api_keys where id = '${keyId}'`), "1", "Alice (owner) can see the key she created");
      assertEqual(psqlAsCarol(`select count(*) from core.api_keys where id = '${keyId}'`), "0", "Carol (viewer) cannot see it -- no settings.manage");

      console.log("Verifying core.api_key_secrets has no SELECT policy at all, for anyone...");
      assertEqual(psqlAsAlice(`select count(*) from core.api_key_secrets where api_key_id = '${keyId}'`), "0", "not even the key's own creator can read key_hash back");

      console.log("Verifying settings.manage-gated revoke (UPDATE)...");
      psqlAsCarol(`update core.api_keys set revoked_at = now() where id = '${keyId}'`);
      assertEqual(psqlAsAlice(`select revoked_at is null from core.api_keys where id = '${keyId}'`), "t", "Carol's revoke attempt silently affects zero rows -- RLS USING excludes it, not a thrown error");
      psqlAsAlice(`update core.api_keys set revoked_at = now() where id = '${keyId}'`);
      assertEqual(psqlAsAlice(`select revoked_at is null from core.api_keys where id = '${keyId}'`), "f", "Alice's own revoke succeeds");

      console.log("Verifying tenant isolation...");
      assertEqual(psqlAsBob(`select count(*) from core.api_keys where id = '${keyId}'`), "0", "Bob (a different business's owner) cannot see Alice's key at all");

      console.log("Verifying core.check_api_rate_limit() -- service_role only, atomic...");
      assertThrows(
        () => psqlAsAlice(`select core.check_api_rate_limit('${aliceBiz}', 3)`),
        "an ordinary authenticated caller cannot call check_api_rate_limit() -- no grant",
      );
      assertEqual(psqlAsService(`select core.check_api_rate_limit('${aliceBiz}', 3)`), "t", "1st call within a limit of 3 succeeds");
      assertEqual(psqlAsService(`select core.check_api_rate_limit('${aliceBiz}', 3)`), "t", "2nd call within limit succeeds");
      assertEqual(psqlAsService(`select core.check_api_rate_limit('${aliceBiz}', 3)`), "t", "3rd call within limit succeeds");
      assertEqual(psqlAsService(`select core.check_api_rate_limit('${aliceBiz}', 3)`), "f", "4th call in the same minute exceeds the limit of 3");
      assertEqual(psqlAsService(`select core.check_api_rate_limit('${bobBiz}', 3)`), "t", "a different business has its own independent counter");

      console.log("Verifying core.next_number_for_api() shares core.next_number()'s own counter...");
      assertThrows(
        () => psqlAsAlice(`select core.next_number_for_api('${aliceBiz}', 'sales_order', 'SO')`),
        "an ordinary authenticated caller cannot call next_number_for_api() -- no grant",
      );
      const first = psqlAsAlice(`select core.next_number('${aliceBiz}', 'sales_order', 'SO')`);
      const second = psqlAsService(`select core.next_number_for_api('${aliceBiz}', 'sales_order', 'SO')`);
      assertEqual(first.endsWith("/0001"), true, "the UI's own next_number() mints the first sales_order number");
      assertEqual(second.slice(0, -4), first.slice(0, -4), "next_number_for_api() continues the same prefix/fiscal-year");
      assertEqual(second.endsWith("/0002"), true, "next_number_for_api() continues the exact same sequence, not a separate counter (0002, not 0001 again)");

      console.log("\nAll core.api_keys checks passed.");
    },
  });
}

main();
