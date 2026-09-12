#!/usr/bin/env node
/**
 * RLS + atomicity test for `core.try_consume_usage_counter()` (PLATFORM-P0-06.3, "Limit
 * Enforcement" -- docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §10). Tenant-isolation
 * test mandatory per CLAUDE.md principle 9. Follows the same shared harness (C-8) every
 * other RLS/behavior test in this repo uses; the concurrency check follows
 * `test-core-number-sequences.mjs`'s own `psqlAsAsync`/`Promise.all` pattern for proving a
 * SECURITY DEFINER function is actually race-free under real concurrent callers, not just
 * correct when called one at a time.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888881";
const BOB = "88888888-8888-8888-8888-888888888882";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_try_consume_usage_counter_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, psqlAsAsync, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants (both default to the 'free' plan via on_core_business_created)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-consume@example.com'),
          ('${BOB}', 'bob-consume@example.com');
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
      assertEqual(psqlAsAlice(`select plan from core.business_settings where business_id = '${aliceBiz}'`), "free", "Alice's business defaults to the free plan");

      console.log("Verifying try_consume_usage_counter() rejects a business the caller doesn't belong to...");
      assertThrows(
        () => psqlAsAlice(`select * from core.try_consume_usage_counter('${bobBiz}', 'prospects', 1, 'current')`),
        "Alice cannot consume against Bob's business, even through the SECURITY DEFINER function",
      );
      assertEqual(psql(`set local role service_role; select count(*) from core.usage_counters where business_id = '${bobBiz}'`), "0", "the rejected call left no row behind");

      console.log("Verifying an unconfigured (plan, resource) pair is treated as unrestricted -- granted, and actually increments...");
      assertEqual(
        psqlAsAlice(`select state, granted, usage_before, usage_after from core.try_consume_usage_counter('${aliceBiz}', 'prospects', 3, 'current')`),
        "unrestricted|t|0|3",
        "no plan_limits row for (free, prospects) -- unrestricted, consumption granted",
      );
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'prospects' and period = 'current'`),
        "3",
        "the counter really was incremented by 3",
      );

      console.log("Seeding plan_limits: businesses=limited(2), opportunities=disabled, ai_credits=unlimited on the free plan...");
      const freePlanId = psql(`select id from platform.plans where key = 'free';`);
      psql(`
        set local role service_role;
        insert into platform.plan_limits (plan_id, resource_key, state, limit_value) values
          ('${freePlanId}', 'businesses', 'limited', 2),
          ('${freePlanId}', 'opportunities', 'disabled', null),
          ('${freePlanId}', 'ai_credits', 'unlimited', null);
      `);

      console.log("Verifying a disabled resource is denied outright, with no side effect...");
      assertEqual(
        psqlAsAlice(`select state, granted, usage_before, usage_after from core.try_consume_usage_counter('${aliceBiz}', 'opportunities', 1, 'current')`),
        "disabled|f|0|0",
        "opportunities is disabled on the free plan -- denied, counter stays at 0",
      );
      assertEqual(psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'opportunities' and period = 'current'`), "0", "no row was left at a nonzero count");

      console.log("Verifying an unlimited resource is always granted regardless of quantity...");
      assertEqual(
        psqlAsAlice(`select state, granted, usage_after from core.try_consume_usage_counter('${aliceBiz}', 'ai_credits', 500, '2026-09')`),
        "unlimited|t|500",
        "ai_credits is unlimited -- a large quantity is still granted",
      );

      console.log("Verifying a limited resource grants up to the limit, then denies with no partial increment...");
      assertEqual(
        psqlAsAlice(`select state, limit_value, granted, usage_before, usage_after from core.try_consume_usage_counter('${aliceBiz}', 'businesses', 1, 'current')`),
        "limited|2|t|0|1",
        "first unit of 2 granted",
      );
      assertEqual(
        psqlAsAlice(`select state, limit_value, granted, usage_before, usage_after from core.try_consume_usage_counter('${aliceBiz}', 'businesses', 1, 'current')`),
        "limited|2|t|1|2",
        "second (and last) unit granted, now at the limit",
      );
      assertEqual(
        psqlAsAlice(`select state, limit_value, granted, usage_before, usage_after from core.try_consume_usage_counter('${aliceBiz}', 'businesses', 1, 'current')`),
        "limited|2|f|2|2",
        "third unit denied -- would exceed the limit of 2 -- counter left unchanged at 2",
      );
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'businesses' and period = 'current'`),
        "2",
        "the counter really is still exactly 2, not 3 -- the denied call had no side effect",
      );

      console.log("Verifying a single over-sized quantity request is denied atomically -- no partial consumption...");
      assertEqual(
        psqlAsBob(`select state, limit_value, granted, usage_before, usage_after from core.try_consume_usage_counter('${bobBiz}', 'businesses', 5, 'current')`),
        "limited|2|f|0|0",
        "Bob requesting 5 against a limit of 2 in one call is denied outright, not partially granted",
      );

      console.log("Verifying p_quantity must be positive...");
      assertThrows(
        () => psqlAsAlice(`select * from core.try_consume_usage_counter('${aliceBiz}', 'businesses', 0, 'current')`),
        "a zero quantity is rejected",
      );
      assertThrows(
        () => psqlAsAlice(`select * from core.try_consume_usage_counter('${aliceBiz}', 'businesses', -1, 'current')`),
        "a negative quantity is rejected",
      );

      console.log("Verifying 10 concurrent callers against a limit of 2 (already at 2) grant exactly 0 more -- no race lets any of them through...");
      const raceResults = await Promise.all(
        Array.from({ length: 10 }, () => psqlAsAsync(ALICE, `select granted from core.try_consume_usage_counter('${aliceBiz}', 'businesses', 1, 'current')`)),
      );
      assertEqual(raceResults.every((r) => r === "f"), true, "every one of 10 concurrent callers was denied (already at the limit of 2)");
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'businesses' and period = 'current'`),
        "2",
        "the counter is still exactly 2 -- none of the 10 concurrent denied attempts leaked a partial increment",
      );

      console.log("Verifying 10 concurrent callers racing for the last 3 slots of a fresh limit of 3 grant exactly 3, never more...");
      psql(`set local role service_role; delete from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'products';`);
      psql(`
        set local role service_role;
        insert into platform.plan_limits (plan_id, resource_key, state, limit_value) values ('${freePlanId}', 'products', 'limited', 3);
      `);
      const raceResults2 = await Promise.all(
        Array.from({ length: 10 }, () => psqlAsAsync(ALICE, `select granted from core.try_consume_usage_counter('${aliceBiz}', 'products', 1, 'current')`)),
      );
      const grantedCount = raceResults2.filter((r) => r === "t").length;
      assertEqual(grantedCount, 3, "exactly 3 of the 10 concurrent callers were granted -- the row lock serialized the race instead of overshooting");
      assertEqual(
        psqlAsAlice(`select count from core.usage_counters where business_id = '${aliceBiz}' and resource_key = 'products' and period = 'current'`),
        "3",
        "the final counter is exactly 3, matching the limit -- no overshoot from the concurrent race",
      );

      console.log("Verifying tenant isolation: Bob's own counters are unaffected by any of Alice's calls...");
      assertEqual(
        psqlAsBob(`select count from core.usage_counters where business_id = '${bobBiz}' and resource_key = 'businesses' and period = 'current'`),
        "0",
        "Bob's over-sized request was denied -- the row created for the check exists (mirroring increment_usage_counter()'s own upsert), but its count is still 0, not 5",
      );

      console.log("\nAll core.try_consume_usage_counter() checks passed.");
    },
  });
}

main();
