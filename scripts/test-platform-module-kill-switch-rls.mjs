#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.module_kill_switch_events` and
 * `platform.set_module_enabled()` (PLATFORM-P0-07.2, "Platform-Wide Module Kill Switch",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §11). Same harness and bar every sibling
 * `platform.*` script in this backlog uses: a role-switched query against a real
 * database, plus a direct proof that the RPC's own internal authorization check (not RLS
 * alone -- SECURITY DEFINER bypasses it) is the real boundary.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "66666666-6666-6666-6666-666666666661"; // business admin -- NOT a superadmin
const ZOE = "66666666-6666-6666-6666-666666666662"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_kill_switch_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-kill-switch@example.com'),
          ('${ZOE}', 'zoe-kill-switch@example.com');
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

      console.log("Verifying a business admin (not a superadmin) is rejected by the function's own check...");
      assertThrows(
        () => psqlAsAlice(`select * from platform.set_module_enabled('fsm', false, 'trying to disable fsm')`),
        "Alice's call is rejected by the function's own internal platform.is_superadmin() check",
      );
      assertEqual(
        psql(`set local role service_role; select enabled from platform.modules where module_key = 'fsm'`),
        "t",
        "fsm is still enabled -- Alice's rejected call changed nothing",
      );
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.module_kill_switch_events`),
        "0",
        "no audit event was written for the rejected call",
      );

      console.log("Verifying a genuine superadmin (Zoe) CAN disable a module, with an atomic audit record...");
      psqlAsZoe(`select * from platform.set_module_enabled('fsm', false, 'Investigating a data-integrity bug')`);
      assertEqual(
        psqlAsZoe(`select enabled from platform.modules where module_key = 'fsm'`),
        "f",
        "fsm.enabled flipped to false",
      );
      assertEqual(
        psqlAsZoe(`select count(*) from platform.module_kill_switch_events where module_key = 'fsm'`),
        "1",
        "exactly one audit event was written",
      );
      assertEqual(
        psqlAsZoe(
          `select enabled::text || ':' || reason || ':' || performed_by::text from platform.module_kill_switch_events where module_key = 'fsm'`,
        ),
        `false:Investigating a data-integrity bug:${ZOE}`,
        "the audit event carries the real enabled value, reason, and performer",
      );

      console.log("Verifying an empty or whitespace-only reason is rejected, even for a real superadmin...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_module_enabled('fsm', true, '')`),
        "an empty reason is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_module_enabled('fsm', true, '   ')`),
        "a whitespace-only reason is rejected",
      );
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.module_kill_switch_events`),
        "1",
        "still exactly one event -- neither rejected call wrote anything",
      );

      console.log("Verifying an unknown module key is rejected...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_module_enabled('not-a-real-module', false, 'testing')`),
        "an unknown module key is rejected",
      );

      console.log("Verifying Zoe can re-enable the module, adding a second audit event...");
      psqlAsZoe(`select * from platform.set_module_enabled('fsm', true, 'Root cause fixed and verified')`);
      assertEqual(psqlAsZoe(`select enabled from platform.modules where module_key = 'fsm'`), "t", "fsm re-enabled");
      assertEqual(
        psqlAsZoe(`select count(*) from platform.module_kill_switch_events where module_key = 'fsm'`),
        "2",
        "two audit events now exist for fsm -- disable, then re-enable",
      );

      console.log("Verifying read access to the audit trail: superadmin-only, not open like platform.modules...");
      assertEqual(psqlAsZoe(`select count(*) from platform.module_kill_switch_events`), "2", "Zoe can read the audit trail");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.module_kill_switch_events`),
        "0",
        "Alice gets zero rows -- the audit trail is not open catalog data like platform.modules itself",
      );

      console.log("Verifying nobody can bypass the function with a direct INSERT (no grant to authenticated at all)...");
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.module_kill_switch_events (module_key, enabled, reason, performed_by) values ('fsm', false, 'bypass attempt', '${ZOE}')`,
          ),
        "even a superadmin cannot INSERT directly -- only set_module_enabled()'s own SECURITY DEFINER path can",
      );
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.module_kill_switch_events`),
        "2",
        "still exactly two events -- the bypass attempt wrote nothing",
      );

      console.log("\nAll platform.module_kill_switch_events / set_module_enabled() checks passed.");
    },
  });
}

main();
