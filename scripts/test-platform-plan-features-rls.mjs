#!/usr/bin/env node
/**
 * RLS test for `platform.features` and `platform.plan_features` (PLATFORM-P0-04.4,
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §8). Same harness and bar every prior
 * `platform.*` table has set: a role-switched query against a real database, plus a
 * direct re-proof that these two new tables are covered by PLATFORM-P0-03.4's own
 * schema-grant fix.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "44444444-4444-4444-4444-444444444449"; // business admin -- NOT a superadmin
const ZOE = "44444444-4444-4444-4444-444444444450"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_plan_features_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-plan-features@example.com'),
          ('${ZOE}', 'zoe-plan-features@example.com');
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

      console.log("Verifying both catalogs start empty -- no fabricated seed features...");
      assertEqual(psql(`select count(*) from platform.features`), "0", "no features defined yet");
      assertEqual(psql(`select count(*) from platform.plan_features`), "0", "no entitlements configured yet");

      console.log("Verifying a business admin (not a superadmin) cannot see or change the feature catalog...");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.features`),
        "0",
        "Alice gets 0 rows on SELECT -- the schema-level grant is present, not just RLS denying her",
      );
      assertThrows(
        () =>
          psqlAsAlice(
            `insert into platform.features (module_key, key, name) values ('discovery', 'rogue', 'Rogue Feature')`,
          ),
        "Alice's INSERT into the catalog is rejected by the WITH CHECK clause",
      );

      console.log("Verifying a genuine superadmin (Zoe) CAN manage the catalog and per-plan entitlements...");
      const featureId = psqlAsZoe(`
        insert into platform.features (module_key, key, name, description)
        values ('discovery', 'advanced_signals', 'Advanced Signals', 'Deeper buying-intent scoring')
        returning id
      `);
      assertEqual(psqlAsZoe(`select count(*) from platform.features`), "1", "Zoe's INSERT succeeds");

      const proPlanId = psqlAsZoe(`select id from platform.plans where key = 'pro'`);
      const freePlanId = psqlAsZoe(`select id from platform.plans where key = 'free'`);

      console.log("Verifying a feature with no plan_features row is implicitly not entitled...");
      assertEqual(
        psqlAsZoe(`select count(*) from platform.plan_features where feature_id = '${featureId}'`),
        "0",
        "no entitlement row exists for any plan yet -- 'not entitled' is the honest default",
      );

      psqlAsZoe(`insert into platform.plan_features (plan_id, feature_id, enabled) values ('${proPlanId}', '${featureId}', true)`);
      assertEqual(
        psqlAsZoe(`select enabled from platform.plan_features where plan_id = '${proPlanId}' and feature_id = '${featureId}'`),
        "t",
        "Zoe entitles Advanced Signals for the Pro plan",
      );
      assertEqual(
        psqlAsZoe(`select count(*) from platform.plan_features where plan_id = '${freePlanId}' and feature_id = '${featureId}'`),
        "0",
        "the Free plan has no row for this feature -- still implicitly not entitled",
      );

      console.log("Verifying a business admin cannot see or change plan_features either...");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.plan_features`),
        "0",
        "Alice gets 0 rows on SELECT",
      );
      psqlAsAlice(`update platform.plan_features set enabled = false where feature_id = '${featureId}'`);
      assertEqual(
        psql(`set local role service_role; select enabled from platform.plan_features where feature_id = '${featureId}'`),
        "t",
        "Alice's UPDATE silently affects zero rows -- Pro's entitlement is untouched",
      );

      console.log("Verifying the (module_key, key) uniqueness constraint holds for a superadmin...");
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.features (module_key, key, name) values ('discovery', 'advanced_signals', 'Duplicate')`,
          ),
        "a duplicate (module_key, key) pair is rejected even for a superadmin",
      );

      console.log("Verifying deleting a feature cascades to every plan's own entitlement row...");
      psqlAsZoe(`delete from platform.features where id = '${featureId}'`);
      assertEqual(psqlAsZoe(`select count(*) from platform.features`), "0", "the feature itself is gone");
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.plan_features where feature_id = '${featureId}'`),
        "0",
        "its plan_features row (Pro's entitlement) was cascade-deleted, not left orphaned",
      );

      console.log("\nAll platform.features / platform.plan_features RLS checks passed.");
    },
  });
}

main();
