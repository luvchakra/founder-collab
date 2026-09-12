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
        "Alice's INSERT is rejected by the WITH CHECK clause (platform.is_superadmin() is false for her)",
      );
      psqlAsAlice(`update platform.plans set price = 0 where key = 'max'`);
      assertEqual(
        psql(`set local role service_role; select price from platform.plans where key = 'max'`),
        "9999.00",
        "Alice's UPDATE silently affects zero rows -- the Max plan's price is untouched",
      );

      console.log("Verifying a genuine superadmin (Zoe) CAN read, create, and update plans...");
      assertEqual(psqlAsZoe(`select count(*) from platform.plans`), "3", "Zoe can SELECT the seeded catalog");
      psqlAsZoe(`insert into platform.plans (key, name, price, status) values ('enterprise', 'Enterprise', 49999, 'draft')`);
      assertEqual(psqlAsZoe(`select count(*) from platform.plans`), "4", "Zoe's INSERT succeeds");
      psqlAsZoe(`update platform.plans set status = 'active' where key = 'enterprise'`);
      assertEqual(
        psqlAsZoe(`select status from platform.plans where key = 'enterprise'`),
        "active",
        "Zoe's UPDATE succeeds",
      );

      console.log("Verifying nobody -- superadmin included -- can DELETE a plan (PLATFORM-P0-04.7's own rule)...");
      assertThrows(
        () => psqlAsZoe(`delete from platform.plans where key = 'enterprise'`),
        "even a superadmin cannot DELETE a plan -- no DELETE policy or grant to authenticated, by design (04.7: never delete a plan)",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.plans`), "4", "still 4 rows -- the delete attempt was a no-op");

      console.log("Verifying the key uniqueness constraint holds for a superadmin too...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.plans (key, name) values ('pro', 'Duplicate Pro')`),
        "a duplicate key is rejected by the unique constraint even for a superadmin",
      );

      console.log("\nAll platform.plans RLS checks passed.");
    },
  });
}

main();
