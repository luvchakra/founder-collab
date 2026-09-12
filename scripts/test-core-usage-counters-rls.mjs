#!/usr/bin/env node
/**
 * RLS + behavior test for `core.usage_counters` (PLATFORM-P0-06.1, decision #3 from this
 * run's own task brief). Tenant-isolation test mandatory per CLAUDE.md principle 9 (this
 * is business-scoped, billing-adjacent data). Follows the same shared harness (C-8) every
 * other RLS/behavior test in this repo uses, and the same "no client-facing write, one
 * SECURITY DEFINER function is the only path to a row" pattern `test-core-audit-log.mjs`
 * already established for `core.audit_log`.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "77777777-7777-7777-7777-777777777771";
const BOB = "77777777-7777-7777-7777-777777777772";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_usage_counters_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-usage@example.com'),
          ('${BOB}', 'bob-usage@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBiz = psqlAsAlice(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      const bobBiz = psqlAsBob(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);

      console.log("Verifying there is no client-facing write policy at all (no INSERT/UPDATE/DELETE policy exists -- the harness's own broad schema GRANT, same as every sibling test, is what makes this a real RLS check rather than a grant check)...");
      // INSERT with no applicable WITH CHECK policy raises a real "row-level security
      // policy" error (Postgres' own behavior for INSERT specifically) -- but UPDATE/
      // DELETE with no USING policy simply match zero rows and succeed silently, the same
      // "Alice's UPDATE silently affects zero rows" shape every sibling platform.plan_*
      // test already uses for its own no-policy write checks.
      assertThrows(
        () => psqlAsAlice(`insert into core.usage_counters (business_id, resource_key) values ('${aliceBiz}', 'prospects')`),
        "a direct client INSERT is rejected -- no INSERT policy exists on this table",
      );
      psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'prospects', 1, 'current')`);
      psqlAsAlice(`update core.usage_counters set count = 999 where business_id = '${aliceBiz}'`);
      assertEqual(
        psql(`set local role service_role; select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'prospects'`),
        "1",
        "Alice's direct UPDATE silently affects zero rows -- no UPDATE policy exists, only increment_usage_counter() can change a count",
      );
      psqlAsAlice(`delete from core.usage_counters where business_id = '${aliceBiz}'`);
      assertEqual(
        psql(`set local role service_role; select count(*) from core.usage_counters where business_id = '${aliceBiz}'`),
        "1",
        "Alice's direct DELETE silently affects zero rows -- no DELETE policy exists",
      );
      psql(`set local role service_role; delete from core.usage_counters where business_id = '${aliceBiz}';`);

      console.log("Verifying increment_usage_counter() rejects a business the caller doesn't belong to...");
      assertThrows(
        () => psqlAsAlice(`select core.increment_usage_counter('${bobBiz}', 'prospects', 1, 'current')`),
        "Alice cannot increment a counter for Bob's business, even through the SECURITY DEFINER function",
      );
      assertEqual(psql(`set local role service_role; select count(*) from core.usage_counters where business_id = '${bobBiz}'`), "0", "the rejected call left no row behind");

      console.log("Verifying increment_usage_counter() upserts and increments atomically...");
      psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'prospects', 1, 'current')`);
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'prospects' and period = 'current'`),
        "1",
        "the first call creates the row at count 1",
      );
      psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'prospects', 3, 'current')`);
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'prospects' and period = 'current'`),
        "4",
        "a second call increments the same row rather than creating a duplicate",
      );

      console.log("Verifying a negative delta decrements, and never goes below zero...");
      psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'prospects', -10, 'current')`);
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'prospects' and period = 'current'`),
        "0",
        "a decrement past zero clamps to zero, never negative",
      );

      console.log("Verifying period-scoped counters are independent rows...");
      psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'ai_runs', 2, '2026-09')`);
      psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'ai_runs', 5, '2026-10')`);
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'ai_runs' and period = '2026-09'`),
        "2",
        "September's own counter is unaffected by October's increment",
      );
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'ai_runs' and period = '2026-10'`),
        "5",
        "October has its own independent counter",
      );

      console.log("Verifying the resource_key CHECK constraint rejects an unknown dimension...");
      assertThrows(
        () => psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'not_a_real_resource', 1, 'current')`),
        "an unrecognized resource_key is rejected -- the 13 dimensions are a closed list",
      );

      console.log("Verifying the period CHECK constraint rejects a malformed period...");
      assertThrows(
        () => psqlAsAlice(`select core.increment_usage_counter('${aliceBiz}', 'ai_runs', 1, 'not-a-period')`),
        "a period that is neither 'current' nor YYYY-MM is rejected",
      );

      console.log("Verifying tenant isolation on reads...");
      assertEqual(psqlAsAlice(`select count(*) from core.usage_counters`), "3", "Alice sees only her own three counter rows (prospects/current, ai_runs/2026-09, ai_runs/2026-10)");
      assertEqual(psqlAsBob(`select count(*) from core.usage_counters`), "0", "Bob sees none of Alice's usage counters");

      console.log("\nAll core.usage_counters checks passed.");
    },
  });
}

main();
