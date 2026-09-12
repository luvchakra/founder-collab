#!/usr/bin/env node
/**
 * RLS test for `platform.modules` (PLATFORM-P0-07.1,
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §11). Same harness and bar
 * `test-platform-plan-modules-rls.mjs`/`test-platform-plans-rls.mjs` set for every
 * `platform.*` table: a role-switched query against a real database, and an explicit
 * re-proof that this new table is covered by PLATFORM-P0-03.4's schema-grant fix (a
 * business admin must get 0 rows from RLS, never a schema-level "permission denied" thrown
 * before RLS is ever evaluated).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "55555555-5555-5555-5555-555555555551"; // business admin -- NOT a superadmin
const ZOE = "55555555-5555-5555-5555-555555555552"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_modules_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-modules@example.com'),
          ('${ZOE}', 'zoe-modules@example.com');
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

      console.log("Verifying the migration's own seed: one row per core.modules key, all defaults...");
      assertEqual(psql(`select count(*) from platform.modules`), "5", "5 core.modules rows seeded 1:1");
      assertEqual(psql(`select bool_and(enabled) from platform.modules`), "t", "every module starts enabled");
      assertEqual(psql(`select bool_and(visible) from platform.modules`), "t", "every module starts visible");
      assertEqual(
        psql(`select count(*) from platform.modules where status = 'available'`),
        "5",
        "every module starts 'available'",
      );
      assertEqual(psql(`select count(*) from platform.modules where version is not null`), "0", "no fabricated version");

      console.log("Verifying the status CHECK constraint rejects an unknown value...");
      assertThrows(
        () => psql(`set local role service_role; update platform.modules set status = 'bogus' where module_key = 'fsm'`),
        "an unknown status value is rejected by the CHECK constraint",
      );

      console.log("Verifying a business admin (not a superadmin) can read but not write the module registry...");
      // PLATFORM-P0-07.1's own migration opens SELECT to any authenticated user from the
      // start (the route guard/requireModule() enforcement PLATFORM-P0-07.2 adds runs as
      // the signed-in business member, not a superadmin) -- write access stays
      // superadmin-only, asserted right below.
      assertEqual(psqlAsAlice(`select count(*) from platform.modules`), "5", "Alice can read every row");
      psqlAsAlice(`update platform.modules set visible = false where module_key = 'fsm'`);
      assertEqual(
        psql(`set local role service_role; select bool_and(visible) from platform.modules where module_key = 'fsm'`),
        "t",
        "Alice's UPDATE silently affects zero rows -- the USING clause hides every row from her, fsm's visible flag is untouched",
      );
      assertThrows(
        () => psqlAsAlice(`insert into platform.modules (module_key) values ('crm') on conflict do nothing`),
        "Alice cannot INSERT either (moot here since 'crm' already exists, but the WITH CHECK still fires)",
      );

      console.log("Verifying a genuine superadmin (Zoe) CAN toggle visible and set status/version...");
      assertEqual(psqlAsZoe(`select count(*) from platform.modules`), "5", "Zoe can SELECT every row");
      psqlAsZoe(`update platform.modules set visible = false where module_key = 'crm'`);
      assertEqual(
        psqlAsZoe(`select visible from platform.modules where module_key = 'crm'`),
        "f",
        "Zoe's UPDATE succeeds -- crm is now hidden",
      );
      psqlAsZoe(`update platform.modules set status = 'maintenance', version = '1.4' where module_key = 'gst'`);
      assertEqual(
        psqlAsZoe(`select status || ':' || version from platform.modules where module_key = 'gst'`),
        "maintenance:1.4",
        "Zoe can set status and version together",
      );

      console.log("Verifying nobody can DELETE a module registry row (no delete policy or grant exists)...");
      assertThrows(
        () => psqlAsZoe(`delete from platform.modules where module_key = 'gst'`),
        "even a superadmin cannot DELETE -- no delete grant to authenticated at all",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.modules`), "5", "still 5 rows");

      console.log("\nAll platform.modules RLS checks passed.");
    },
  });
}

main();
