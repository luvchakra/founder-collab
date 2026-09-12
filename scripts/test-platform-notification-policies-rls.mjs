#!/usr/bin/env node
/**
 * RLS test for `platform.notification_policies` (PLATFORM-P0-11.3, "Notification
 * Policies", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §15). Same harness and bar
 * every sibling `platform.*` migration in this backlog has been held to.
 *
 * Unlike PLATFORM-P0-11.1/11.2's own audited-RPC tables, this one uses the plain
 * RLS-gated `select`/`update` shape `platform.branding` already established (see the
 * migration's own docstring for why) -- so what this proves is narrower and more direct:
 *   - the singleton starts seeded with all three channels false -- no fabricated "on"
 *     state;
 *   - a non-superadmin business admin sees zero rows on SELECT (RLS-filtered, not an
 *     error) and her UPDATE silently affects zero rows (RLS `USING` excludes it, the row
 *     is untouched);
 *   - a genuine superadmin can SELECT the one row and successfully UPDATE it directly;
 *   - even a genuine superadmin cannot INSERT a second row or DELETE the singleton -- no
 *     such policy or grant exists for `authenticated` at all, matching `platform.branding`'s
 *     own "the row count can never drift from exactly 1" design.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-999999999995"; // business admin -- NOT a superadmin
const ZOE = "99999999-9999-9999-9999-999999999996"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_notification_policies_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-notification-policies@example.com'),
          ('${ZOE}', 'zoe-notification-policies@example.com');
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

      console.log("Verifying the singleton starts seeded with all three channels false...");
      assertEqual(
        psql(`select email_enabled::text || ':' || in_app_enabled::text || ':' || push_enabled::text from platform.notification_policies where id = true`),
        "false:false:false",
        "no fabricated 'on' state for any channel",
      );

      console.log("Verifying Alice (not a superadmin) cannot see the row at all...");
      assertEqual(psqlAsAlice(`select count(*) from platform.notification_policies`), "0", "Alice's SELECT is RLS-filtered to zero rows, not an error");

      console.log("Verifying Alice's UPDATE silently affects zero rows...");
      psqlAsAlice(`update platform.notification_policies set email_enabled = true, in_app_enabled = true, push_enabled = true where id = true`);
      assertEqual(
        psql(`set local role service_role; select email_enabled::text || ':' || in_app_enabled::text || ':' || push_enabled::text from platform.notification_policies where id = true`),
        "false:false:false",
        "the row is completely untouched by Alice's attempt",
      );

      console.log("Verifying a genuine superadmin (Zoe) can read and update the row...");
      assertEqual(psqlAsZoe(`select count(*) from platform.notification_policies`), "1", "Zoe can SELECT the one row");
      psqlAsZoe(`update platform.notification_policies set email_enabled = true where id = true`);
      assertEqual(
        psqlAsZoe(`select email_enabled::text || ':' || in_app_enabled::text || ':' || push_enabled::text from platform.notification_policies where id = true`),
        "true:false:false",
        "Zoe's own UPDATE succeeds, exactly the field she changed",
      );

      console.log("Verifying nobody -- superadmin included -- can INSERT a 2nd row or DELETE the singleton...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.notification_policies (id, email_enabled) values (false, true)`),
        "even a superadmin cannot INSERT into platform.notification_policies -- no INSERT policy or grant to authenticated",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.notification_policies where id = true`),
        "even a superadmin cannot DELETE the singleton row -- no DELETE policy or grant to authenticated",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.notification_policies`), "1", "the row survives both attempts -- still exactly 1");

      console.log("\nAll platform.notification_policies RLS checks passed.");
    },
  });
}

main();
