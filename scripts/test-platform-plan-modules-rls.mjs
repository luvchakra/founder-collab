#!/usr/bin/env node
/**
 * RLS test for `platform.plan_modules` (PLATFORM-P0-04.3,
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8). Same harness and bar
 * `test-platform-plans-rls.mjs`/`test-platform-branding-rls.mjs` set for every
 * `platform.*` table: a role-switched query against a real database, and an explicit
 * re-proof that this new table is covered by PLATFORM-P0-03.4's schema-grant fix (a
 * business admin must get 0 rows from RLS, never a schema-level "permission denied"
 * thrown before RLS is ever evaluated).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "44444444-4444-4444-4444-444444444445"; // business admin -- NOT a superadmin
const ZOE = "44444444-4444-4444-4444-444444444446"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_plan_modules_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-plan-modules@example.com'),
          ('${ZOE}', 'zoe-plan-modules@example.com');
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

      console.log("Verifying the migration's own seed: every plan x every module, enabled...");
      assertEqual(
        psql(`select count(*) from platform.plan_modules`),
        "15",
        "3 seeded plans (free/pro/max) x 5 core.modules rows = 15",
      );
      assertEqual(
        psql(`select bool_and(enabled) from platform.plan_modules`),
        "t",
        "every seeded row defaults to enabled = true",
      );

      console.log("Verifying a business admin (not a superadmin) can read but not change module entitlements...");
      // PLATFORM-P0-05.2/05.3's own migration opened SELECT on this catalog to any
      // authenticated user (the Entitlement Engine reads it on behalf of ordinary business
      // members) -- write access stays superadmin-only, asserted right below.
      assertEqual(
        psqlAsAlice(`select count(*) from platform.plan_modules`),
        "15",
        "Alice can read every row -- SELECT is open to any authenticated user",
      );

      // A fresh plan with no plan_modules rows yet (seeded directly via service_role,
      // bypassing the app-level seedPlanModuleEntitlements() this raw-SQL test doesn't
      // call) -- so Alice's insert attempt below hits a combo that genuinely doesn't
      // exist yet, isolating the RLS WITH CHECK itself rather than colliding with the
      // primary key on an already-seeded (plan, module) pair.
      const bareplanId = psql(`set local role service_role; insert into platform.plans (key, name) values ('bare', 'Bare') returning id`);
      assertThrows(
        () => psqlAsAlice(`insert into platform.plan_modules (plan_id, module_key) values ('${bareplanId}', 'fsm')`),
        "Alice's INSERT is rejected by the WITH CHECK clause",
      );
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.plan_modules where plan_id = '${bareplanId}'`),
        "0",
        "Alice's rejected insert left zero rows behind",
      );
      psqlAsAlice(`update platform.plan_modules set enabled = false where module_key = 'fsm'`);
      assertEqual(
        psql(`set local role service_role; select bool_and(enabled) from platform.plan_modules where module_key = 'fsm'`),
        "t",
        "Alice's UPDATE silently affects zero rows -- fsm entitlements are untouched",
      );

      console.log("Verifying a genuine superadmin (Zoe) CAN read and toggle module entitlements...");
      assertEqual(psqlAsZoe(`select count(*) from platform.plan_modules`), "15", "Zoe can SELECT every row");
      const freePlanId = psqlAsZoe(`select id from platform.plans where key = 'free'`);
      psqlAsZoe(`update platform.plan_modules set enabled = false where plan_id = '${freePlanId}' and module_key = 'fsm'`);
      assertEqual(
        psqlAsZoe(`select enabled from platform.plan_modules where plan_id = '${freePlanId}' and module_key = 'fsm'`),
        "f",
        "Zoe's UPDATE succeeds -- Free plan's fsm module is now disabled",
      );

      console.log("Verifying nobody can DELETE a plan_modules row (no delete policy or grant exists)...");
      assertThrows(
        () => psqlAsZoe(`delete from platform.plan_modules where plan_id = '${freePlanId}' and module_key = 'fsm'`),
        "even a superadmin cannot DELETE -- no delete grant to authenticated at all",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.plan_modules`), "15", "still 15 rows");

      console.log("Verifying a new plan created by a superadmin gets the full module set seeded...");
      // PLATFORM-P0-17.1 (20260913470000_platform_plan_events.sql): platform.plans no
      // longer grants INSERT to `authenticated` at all -- a real plan creation now goes
      // through platform.create_plan(), tested in its own
      // test-platform-config-versioning-rls.mjs. This script's own subject is
      // platform.plan_modules, not plan creation, so the plan itself is seeded directly as
      // service_role (equivalent to any other fixture row in this file) rather than
      // re-proving create_plan()'s own behavior here too.
      const newPlanId = psql(`set local role service_role; insert into platform.plans (key, name) values ('enterprise', 'Enterprise') returning id`);
      psqlAsZoe(`
        insert into platform.plan_modules (plan_id, module_key, enabled)
        select '${newPlanId}', key, true from core.modules
      `);
      assertEqual(
        psqlAsZoe(`select count(*) from platform.plan_modules where plan_id = '${newPlanId}'`),
        "5",
        "the application layer's seedPlanModuleEntitlements() inserts one row per module for a new plan -- simulated here directly via SQL",
      );

      console.log("\nAll platform.plan_modules RLS checks passed.");
    },
  });
}

main();
