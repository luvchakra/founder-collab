#!/usr/bin/env node
/**
 * RLS test for `platform.admins`/`platform.branding` (PLATFORM-P0-01, PLATFORM-P0-03.1,
 * PLATFORM-P0-03.3), written for PLATFORM-P0-03.4 ("Customer-Facing Branding Scope" --
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §7). This is the first automated RLS test
 * for the `platform` schema -- PLATFORM-P0-01/03.1/03.3 verified the policy *definitions*
 * by reading the migration SQL, but never actually ran a role-switched query against
 * them, which is exactly the gap that let a real bug (see
 * 20260912010000_platform_schema_grants.sql) ship undetected for a full day: `platform`
 * never got the schema-level `grant usage ... to authenticated` every other module
 * schema's own creation migration already has, so even a genuine superadmin got
 * "permission denied for schema platform" (42501) on every read/write -- a schema-level
 * error thrown before RLS is ever evaluated, confirmed live against the dev project via
 * `execute_sql` while investigating this exact story.
 *
 * Covers the literal ask of PLATFORM-P0-03.4 -- "Business administrators must not be able
 * to change WonderArc's global brand" -- with a real business, a real
 * `core.business_members.role = 'admin'` row (business owner Alice's own store), and
 * confirms that business admin cannot SELECT or UPDATE `platform.branding`, nor SELECT
 * `platform.admins`' roster, while a genuine superadmin (Zoe, seeded directly into
 * `platform.admins` the same service-role-only way the real bootstrap flow works) can do
 * both. Also confirms the negative space that isn't RLS's job here: no authenticated
 * caller, superadmin or not, can INSERT a second `platform.branding` row or DELETE the
 * one row -- there is no INSERT/DELETE policy on that table at all (only `grant all` to
 * `service_role`), by design (03.1's own "the row count can never drift from exactly 1
 * through the app").
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "44444444-4444-4444-4444-444444444441"; // business admin -- NOT a superadmin
const ZOE = "44444444-4444-4444-4444-444444444442"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_branding_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${ZOE}', 'zoe@example.com');
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
      `);
      // Zoe is seeded as a superadmin the same way the real bootstrap flow does it --
      // service_role (BYPASSRLS)/migration only, matching platform.admins' own "no
      // insert policy yet" design (PLATFORM-P0-01).
      psql(`
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("Verifying PLATFORM-P0-03.4: a business admin cannot see or change WonderArc's global brand...");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.branding`),
        "0",
        "Alice (core.business_members.role = 'admin', not a superadmin) cannot SELECT platform.branding at all -- 0 rows, not an error",
      );
      psqlAsAlice(`update platform.branding set platform_name = 'Alice''s Brand' where id = true`);
      assertEqual(
        psql(`set local role service_role; select platform_name from platform.branding where id = true`),
        "WonderArc",
        "Alice's UPDATE silently affects zero rows -- RLS USING excludes it, the row is untouched",
      );
      assertEqual(
        psqlAsAlice(`select count(*) from platform.admins`),
        "0",
        "Alice cannot see the superadmin roster either -- same is_superadmin() gate",
      );

      console.log("Verifying a genuine superadmin (Zoe) CAN read and update it...");
      assertEqual(psqlAsZoe(`select count(*) from platform.branding`), "1", "Zoe (a real superadmin) can SELECT the one branding row");
      psqlAsZoe(`update platform.branding set platform_name = 'Zoe''s WonderArc' where id = true`);
      assertEqual(
        psqlAsZoe(`select platform_name from platform.branding where id = true`),
        "Zoe's WonderArc",
        "Zoe's own UPDATE succeeds",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.admins`), "1", "Zoe can see the superadmin roster");

      console.log("Verifying nobody -- superadmin included -- can INSERT a 2nd row or DELETE the singleton via RLS/grants...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.branding (id, platform_name) values (false, 'Rogue')`),
        "even a superadmin cannot INSERT into platform.branding -- no INSERT policy or grant to authenticated",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.branding where id = true`),
        "even a superadmin cannot DELETE the singleton row -- no DELETE policy or grant to authenticated",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.branding`), "1", "the row survives both attempts -- still exactly 1");

      console.log("\nAll platform.branding / platform.admins RLS checks passed.");
    },
  });
}

main();
