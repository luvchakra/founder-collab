#!/usr/bin/env node
/**
 * RLS test for `platform.plans` (PLATFORM-P0-04.1, docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md
 * §8). Same harness and same bar `test-platform-branding-rls.mjs` (PLATFORM-P0-03.4) set
 * for every `platform.*` table going forward: a role-switched query against a real
 * database, not just a read of the policy SQL -- exactly the gap that let the
 * `grant usage on schema platform` bug ship undetected for a full day.
 *
 * Also directly re-proves that fix still covers a brand-new table: a business admin
 * (Alice) querying `platform.plans` must get 0 rows from RLS, never a schema-level
 * "permission denied" thrown before RLS is even evaluated -- the class of bug
 * PLATFORM-P0-03.4 found and `20260912010000_platform_schema_grants.sql` fixed.
 *
 * **Updated for PLATFORM-P0-17.1/17.3 (`20260913470000_platform_plan_events.sql`)**:
 * `platform.plans` no longer grants INSERT/UPDATE to `authenticated` at all -- every
 * mutation now goes through `platform.create_plan()`/`platform.update_plan()` so a
 * `reason` is captured in the new `platform.plan_events` audit trail. This script's own
 * write-path assertions below were updated to match (a direct INSERT/UPDATE is now a flat
 * permission error for everyone, superadmin included, rather than a silently-filtered
 * RLS no-op) -- see `test-platform-config-versioning-rls.mjs` for the full behavior test
 * of the two new functions and their audit trail.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "44444444-4444-4444-4444-444444444443"; // business admin -- NOT a superadmin
const ZOE = "44444444-4444-4444-4444-444444444444"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_plans_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-plans@example.com'),
          ('${ZOE}', 'zoe-plans@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role)
        values ('${aliceBiz}', '${ALICE}', 'admin');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("Verifying the seeded catalog is really there (service_role read)...");
      assertEqual(psql(`select count(*) from platform.plans`), "3", "the migration seeded exactly Free/Pro/Max");

      console.log("Verifying a business admin (not a superadmin) can read but not change plans...");
      // PLATFORM-P0-05.2/05.3's own migration (20260912080000_platform_catalog_
      // authenticated_read.sql) opened SELECT on this non-sensitive commercial catalog to
      // any authenticated user -- the Entitlement Engine's hasFeature()/getLimit() run as
      // an ordinary business member, not a superadmin, and need to read it. Alice getting
      // real rows back here now proves that fix (and the underlying schema-level grant
      // PLATFORM-P0-03.4 already established) both hold; write access stays superadmin-only,
      // asserted right below.
      assertEqual(
        psqlAsAlice(`select count(*) from platform.plans`),
        "3",
        "Alice (core.business_members.role = 'admin', not a superadmin) can read the plan catalog -- SELECT is open to any authenticated user",
      );
      assertThrows(
        () => psqlAsAlice(`insert into platform.plans (key, name) values ('rogue', 'Rogue Plan')`),
        "Alice's direct INSERT is rejected -- no INSERT grant to authenticated at all anymore",
      );
      assertThrows(
        () => psqlAsAlice(`update platform.plans set price = 0 where key = 'max'`),
        "Alice's direct UPDATE is rejected -- no UPDATE grant to authenticated at all anymore",
      );
      assertEqual(
        psql(`set local role service_role; select price from platform.plans where key = 'max'`),
        "9999.00",
        "the Max plan's price is untouched",
      );

      console.log("Verifying even a genuine superadmin (Zoe) cannot write to platform.plans directly anymore...");
      assertEqual(psqlAsZoe(`select count(*) from platform.plans`), "3", "Zoe can still SELECT the seeded catalog");
      assertThrows(
        () =>
          psqlAsZoe(`insert into platform.plans (key, name, price, status) values ('enterprise', 'Enterprise', 49999, 'draft')`),
        "even Zoe's direct INSERT is rejected -- platform.create_plan() is the only path to a row now (PLATFORM-P0-17.1)",
      );
      assertThrows(
        () => psqlAsZoe(`update platform.plans set status = 'active' where key = 'pro'`),
        "even Zoe's direct UPDATE is rejected -- platform.update_plan() is the only path to a row now (PLATFORM-P0-17.1)",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.plans`), "3", "no residue from either rejected direct write");

      console.log("Verifying nobody -- superadmin included -- can DELETE a plan (PLATFORM-P0-04.7's own rule)...");
      assertThrows(
        () => psqlAsZoe(`delete from platform.plans where key = 'pro'`),
        "even a superadmin cannot DELETE a plan -- no DELETE policy or grant to authenticated, by design (04.7: never delete a plan)",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.plans`), "3", "still 3 rows -- the delete attempt was a no-op");

      console.log("Verifying the key uniqueness constraint holds through platform.create_plan() too...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_plan('pro', 'Duplicate Pro', null, 1, 'month', 'INR', 'draft', 9, true, 'duplicate attempt')`,
          ),
        "a duplicate key is rejected by the unique constraint even through create_plan()",
      );

      console.log("\nAll platform.plans RLS checks passed. See test-platform-config-versioning-rls.mjs for platform.create_plan()/update_plan()/plan_events' own full behavior test.");
    },
  });
}

main();
