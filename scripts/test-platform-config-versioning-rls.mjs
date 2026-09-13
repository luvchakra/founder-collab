#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.plan_events` and the new `platform.create_plan()`/
 * `platform.update_plan()` functions (PLATFORM-P0-17.1/17.3, "Configuration Versioning",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §22 --
 * `20260913470000_platform_plan_events.sql`). Same harness and bar every sibling
 * `platform.*` migration in this backlog has been held to.
 *
 * This is the one genuinely new SQL surface this story adds -- every other resource type
 * `config-history.ts` reads from (feature_flags, announcements, system_policies, ai
 * providers/routing/feature-policies, email provider/templates, integrations, module
 * status) already has its own dedicated RLS test script from its own original story, and
 * this story adds no new column, policy, or function to any of those tables. Restoring a
 * plan/feature flag/announcement/system-policy version is, by design, just another call
 * to that table's own already-tested `update_*()` function (see `config-history.ts`'s own
 * docstring) -- so there is nothing new at the SQL layer to assert there beyond what this
 * script and those tables' own pre-existing scripts already cover between them.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - `platform.plans` no longer accepts a direct INSERT/UPDATE from `authenticated` at
 *     all -- not even for a genuine superadmin -- now that `create_plan()`/`update_plan()`
 *     are the only paths to a row;
 *   - both functions reject a non-superadmin outright, with zero residue in either table;
 *   - a reason is required unconditionally for both;
 *   - create/update each write exactly one atomic `plan_events` row with a real
 *     before/after JSONB snapshot, and `update_plan()` never touches `key`;
 *   - a plan's own `plan_id` on its events survives across an update (nothing nulls it --
 *     unlike a delete, which this table still has no path for at all, exactly as before
 *     this story);
 *   - `plan_events` itself is superadmin-only to read, unlike `platform.plans`' own open
 *     SELECT policy;
 *   - the version-numbering derivation this story adds in `config-history.ts` -- "v1 = the
 *     oldest recorded event" -- lines up with the real row order `plan_events` produces
 *     when queried the same way `listConfigVersions()` does (oldest first).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888891"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888892"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_config_versioning_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-config-versioning@example.com'),
          ('${ZOE}', 'zoe-config-versioning@example.com');
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

      console.log("Verifying the migration's own seed exists but plan_events starts empty...");
      assertEqual(psql(`select count(*) from platform.plans`), "3", "the migration's own free/pro/max seed, untouched");
      assertEqual(psql(`select count(*) from platform.plan_events`), "0", "no plan_events rows before any create_plan/update_plan call");

      console.log("Verifying platform.plans no longer accepts a direct INSERT/UPDATE from authenticated, even for a superadmin...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.plans (key, name) values ('bypass_attempt', 'Bypass')`),
        "even a superadmin cannot INSERT directly into platform.plans -- no grant exists anymore",
      );
      assertThrows(
        () => psqlAsZoe(`update platform.plans set name = 'Hacked' where key = 'free'`),
        "even a superadmin cannot UPDATE platform.plans directly -- no grant exists anymore",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.plan_events (key, action, reason) values ('bypass', 'created', 'bypass attempt')`,
          ),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("Verifying a business admin (not a superadmin) can still read the open plan catalog but cannot create/update via the functions...");
      assertEqual(psqlAsAlice(`select count(*) from platform.plans`), "3", "Alice can still read the open plan catalog (PLATFORM-P0-05.2, untouched)");
      assertThrows(
        () =>
          psqlAsAlice(
            `select * from platform.create_plan('growth', 'Growth', null, 4999, 'month', 'INR', 'draft', 3, true, 'trying to create')`,
          ),
        "Alice's create attempt is rejected by the function's own internal check",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.plans`), "3", "zero residue after Alice's rejected create");
      assertEqual(psql(`set local role service_role; select count(*) from platform.plan_events`), "0", "zero residue in the audit trail too");

      console.log("Verifying an empty/whitespace reason is rejected by both functions...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_plan('growth', 'Growth', null, 4999, 'month', 'INR', 'draft', 3, true, '')`,
          ),
        "create rejects an empty reason",
      );
      const proId = psql(`select id from platform.plans where key = 'pro'`);
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.update_plan('${proId}', 'Pro', null, 2999, 'month', 'INR', 'active', 1, true, '   ')`,
          ),
        "update rejects a whitespace-only reason",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.plans`), "3", "still exactly 3 plans -- no partial writes from the rejected calls above");
      assertEqual(psqlAsZoe(`select count(*) from platform.plan_events`), "0", "still no audit events either");

      console.log("Verifying a genuine superadmin (Zoe) can create a plan through create_plan()...");
      const growthId = psqlAsZoe(
        `select id from platform.create_plan('growth', 'Growth', 'For teams scaling past the basics.', 4999, 'month', 'INR', 'draft', 3, true, 'introducing a mid-tier plan')`,
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.plans`), "4", "one new plan now exists");
      assertEqual(
        psqlAsZoe(`select key || ':' || name || ':' || status from platform.plans where id = '${growthId}'`),
        "growth:Growth:draft",
        "the plan was created with the exact values requested",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value is null)::text || ':' || (new_value ->> 'key') from platform.plan_events where plan_id = '${growthId}'`,
        ),
        "created:true:growth",
        "exactly one 'created' event, no previous_value, new_value carries the real row",
      );

      console.log("Verifying a duplicate key is still rejected (even through the function)...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_plan('growth', 'Growth Again', null, 1, 'month', 'INR', 'draft', 9, true, 'duplicate attempt')`,
          ),
        "a duplicate plan key is rejected by the unique constraint",
      );

      console.log("Verifying update_plan mutates the plan and writes exactly one atomic before/after audit event, key untouched...");
      const eventCountBefore = Number(psqlAsZoe(`select count(*) from platform.plan_events`));
      psqlAsZoe(
        `select * from platform.update_plan('${growthId}', 'Growth', 'For teams scaling past the basics.', 5999, 'month', 'INR', 'active', 3, true, 'raising the price and launching')`,
      );
      assertEqual(
        psqlAsZoe(`select key || ':' || price || ':' || status from platform.plans where id = '${growthId}'`),
        "growth:5999.00:active",
        "price and status changed, key untouched -- update_plan has no key parameter at all",
      );
      assertEqual(
        psqlAsZoe(`select count(*) from platform.plan_events`).toString(),
        String(eventCountBefore + 1),
        "exactly one new audit event for the update",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value ->> 'price') || ':' || (new_value ->> 'price') from platform.plan_events where plan_id = '${growthId}' order by performed_at desc limit 1`,
        ),
        "updated:4999.00:5999.00",
        "the audit row captures the real previous/new price inside the JSONB snapshot",
      );

      console.log("Verifying an unknown plan id is rejected by update_plan...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.update_plan('00000000-0000-0000-0000-000000000000', 'X', null, 1, 'month', 'INR', 'draft', 0, true, 'testing')`,
          ),
        "update rejects an unknown plan id",
      );

      console.log("Verifying Alice cannot update the plan either, with zero residue...");
      assertThrows(
        () =>
          psqlAsAlice(
            `select * from platform.update_plan('${growthId}', 'Hacked', null, 1, 'month', 'INR', 'draft', 0, true, 'trying to hijack')`,
          ),
        "Alice's update attempt is rejected",
      );
      assertEqual(
        psql(`set local role service_role; select name from platform.plans where id = '${growthId}'`),
        "Growth",
        "the growth plan is untouched by Alice's rejected attempt",
      );

      console.log("Verifying plan_events is superadmin-only to read, unlike platform.plans' own open SELECT policy...");
      assertEqual(psqlAsAlice(`select count(*) from platform.plan_events`), "0", "Alice gets zero rows from the audit trail");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.plan_events`).toString(), "t", "Zoe (superadmin) can read it");

      console.log("Verifying the version-numbering config-history.ts derives (v1 = oldest event) matches real row order...");
      assertEqual(
        psqlAsZoe(
          `select string_agg(action, ',' order by performed_at asc) from platform.plan_events where plan_id = '${growthId}'`,
        ),
        "created,updated",
        "querying oldest-first (exactly what listConfigVersions() does) yields v1=created, v2=updated, in that order",
      );

      console.log("\nAll platform.plan_events / platform.create_plan / platform.update_plan checks passed.");
    },
  });
}

main();
