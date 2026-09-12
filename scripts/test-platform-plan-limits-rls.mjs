#!/usr/bin/env node
/**
 * RLS test for `platform.plan_limits` (PLATFORM-P0-04.5/04.6,
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8). Same harness and bar every prior
 * `platform.*` table has set: a role-switched query against a real database, plus a
 * direct re-proof that this new table is covered by PLATFORM-P0-03.4's schema-grant fix.
 * Also proves 04.6's own tri-state CHECK constraint (`plan_limits_value_matches_state`)
 * holds even for a superadmin -- the "never a fake unlimited number" rule is enforced by
 * the database itself, not only the app's Zod schema.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "44444444-4444-4444-4444-444444444447"; // business admin -- NOT a superadmin
const ZOE = "44444444-4444-4444-4444-444444444448"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_plan_limits_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-plan-limits@example.com'),
          ('${ZOE}', 'zoe-plan-limits@example.com');
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

      console.log("Verifying the table starts empty -- no fabricated per-plan limits...");
      assertEqual(psql(`select count(*) from platform.plan_limits`), "0", "no limits configured for any plan yet");

      const proPlanId = psql(`select id from platform.plans where key = 'pro'`);

      console.log("Verifying a business admin (not a superadmin) cannot see or change limits...");
      psql(`
        set local role service_role;
        insert into platform.plan_limits (plan_id, resource_key, state, limit_value)
        values ('${proPlanId}', 'businesses', 'limited', 5);
      `);
      assertEqual(
        psqlAsAlice(`select count(*) from platform.plan_limits`),
        "0",
        "Alice gets 0 rows on SELECT -- the schema-level grant is present, not just RLS denying her",
      );
      assertThrows(
        () =>
          psqlAsAlice(
            `insert into platform.plan_limits (plan_id, resource_key, state) values ('${proPlanId}', 'users', 'unlimited')`,
          ),
        "Alice's INSERT is rejected by the WITH CHECK clause",
      );
      psqlAsAlice(`update platform.plan_limits set limit_value = 999 where resource_key = 'businesses'`);
      assertEqual(
        psql(`set local role service_role; select limit_value from platform.plan_limits where resource_key = 'businesses'`),
        "5",
        "Alice's UPDATE silently affects zero rows -- the Pro plan's businesses limit is untouched",
      );
      psqlAsAlice(`delete from platform.plan_limits where resource_key = 'businesses'`);
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.plan_limits where resource_key = 'businesses'`),
        "1",
        "Alice's DELETE (permitted no-op under RLS since her USING clause matches nothing) leaves the row in place",
      );

      console.log("Verifying a genuine superadmin (Zoe) CAN read, set, and clear limits...");
      assertEqual(psqlAsZoe(`select count(*) from platform.plan_limits`), "1", "Zoe can SELECT the seeded row");
      psqlAsZoe(
        `insert into platform.plan_limits (plan_id, resource_key, state) values ('${proPlanId}', 'ai_runs', 'unlimited')`,
      );
      assertEqual(
        psqlAsZoe(`select state, limit_value is null from platform.plan_limits where resource_key = 'ai_runs'`),
        "unlimited|t",
        "Zoe's INSERT succeeds -- unlimited with no numeric value",
      );
      psqlAsZoe(`delete from platform.plan_limits where resource_key = 'ai_runs'`);
      assertEqual(
        psqlAsZoe(`select count(*) from platform.plan_limits where resource_key = 'ai_runs'`),
        "0",
        "Zoe's DELETE succeeds -- reverted to 'not configured'",
      );

      console.log("Verifying the tri-state CHECK constraint holds even for a superadmin...");
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.plan_limits (plan_id, resource_key, state, limit_value) values ('${proPlanId}', 'products', 'unlimited', 999999999)`,
          ),
        "unlimited with a numeric limit_value is rejected -- never a fake huge number standing in for unlimited",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.plan_limits (plan_id, resource_key, state) values ('${proPlanId}', 'products', 'limited')`,
          ),
        "limited with no limit_value is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.plan_limits (plan_id, resource_key, state, limit_value) values ('${proPlanId}', 'products', 'disabled', 0)`,
          ),
        "disabled with a numeric limit_value is rejected",
      );

      console.log("Verifying the resource_key CHECK constraint rejects an unknown dimension...");
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.plan_limits (plan_id, resource_key, state) values ('${proPlanId}', 'bogus_dimension', 'unlimited')`,
          ),
        "an unrecognized resource_key is rejected -- the 13 dimensions are a closed list",
      );

      console.log("\nAll platform.plan_limits RLS checks passed.");
    },
  });
}

main();
