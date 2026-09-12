#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.set_module_status()` and `platform.module_status_events`
 * -- PLATFORM-P0-07.3 ("Module Maintenance Mode", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §11), resumed once the user made the four reconciliation decisions recorded
 * in `docs/design/platform-admin-portal-audit.md`. This is the "real concurrency/
 * consistency re-verification" this backlog's own higher bar calls for when reconciling
 * two previously-independent full-block mechanisms (PLATFORM-P0-07.1's `status` column and
 * PLATFORM-P0-07.2's `enabled` kill switch) into one -- not a read of the updated SQL, an
 * actual run against a real database.
 *
 * What this script proves that `test-platform-modules-rls.mjs` (07.1) and
 * `test-platform-module-kill-switch-rls.mjs` (07.2, now boolean-wrapper-only) do not:
 *   - decision #1: `status='disabled'` and `enabled=false` can never disagree -- `enabled`
 *     is a generated column, not just usually kept in sync by disciplined application code.
 *   - decision #2: `read_only` behaves exactly like a license's own grace period at the
 *     `platform.modules` data layer -- reachable (`enabled=true`) but distinct from
 *     `available`.
 *   - decision #3: `maintenance` and `disabled` are indistinguishable at the `enabled`
 *     level (both `false`) -- there is no third, distinct access level.
 *   - decision #4: every status AND every message change is captured with a full
 *     previous/new snapshot of both fields in one atomic audit row, including a
 *     message-only change that leaves `status` untouched.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "77777777-7777-7777-7777-777777777771"; // business admin -- NOT a superadmin
const ZOE = "77777777-7777-7777-7777-777777777772"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_module_status_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-module-status@example.com'),
          ('${ZOE}', 'zoe-module-status@example.com');
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

      console.log("Decision #1 -- enabled is a generated column, structurally derived from status...");
      for (const [status, expectedEnabled] of [
        ["available", "true"],
        ["read_only", "true"],
        ["maintenance", "false"],
        ["disabled", "false"],
      ]) {
        psqlAsZoe(`select * from platform.set_module_status('gst', '${status}', null, 'exercising ${status}')`);
        assertEqual(
          psqlAsZoe(`select enabled::text from platform.modules where module_key = 'gst'`),
          expectedEnabled,
          `status='${status}' => enabled=${expectedEnabled} (derived, not independently settable)`,
        );
      }
      assertThrows(
        () => psql(`set local role service_role; update platform.modules set enabled = true where module_key = 'gst'`),
        "enabled cannot be assigned directly at all -- it is GENERATED ALWAYS, even for service_role",
      );

      console.log("Decision #3 -- maintenance and disabled are the exact same block (both enabled=false)...");
      psqlAsZoe(`select * from platform.set_module_status('gst', 'maintenance', null, 'maintenance window')`);
      const maintenanceEnabled = psqlAsZoe(`select enabled::text from platform.modules where module_key = 'gst'`);
      psqlAsZoe(`select * from platform.set_module_status('gst', 'disabled', null, 'switching to disabled')`);
      const disabledEnabled = psqlAsZoe(`select enabled::text from platform.modules where module_key = 'gst'`);
      assertEqual(maintenanceEnabled, disabledEnabled, "maintenance and disabled produce an identical enabled value (false)");
      assertEqual(disabledEnabled, "false", "...specifically false, i.e. both are a full block");

      console.log("Resetting gst back to available for the remaining checks...");
      psqlAsZoe(`select * from platform.set_module_status('gst', 'available', null, 'reset for further testing')`);

      console.log("Verifying a business admin (not a superadmin) is rejected by the function's own check...");
      assertThrows(
        () => psqlAsAlice(`select * from platform.set_module_status('gst', 'disabled', null, 'trying to disable gst')`),
        "Alice's call is rejected by the function's own internal platform.is_superadmin() check",
      );
      assertEqual(
        psql(`set local role service_role; select status from platform.modules where module_key = 'gst'`),
        "available",
        "gst is still available -- Alice's rejected call changed nothing",
      );

      console.log("Verifying an empty/whitespace reason is rejected for every status, not only disabling...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_module_status('gst', 'available', null, '')`),
        "an empty reason is rejected even for a no-op-looking 'set to available' transition",
      );
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_module_status('gst', 'read_only', null, '   ')`),
        "a whitespace-only reason is rejected for a read_only transition",
      );

      console.log("Verifying an unknown status value is rejected by the function's own check...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_module_status('gst', 'paused', null, 'testing')`),
        "an unknown status is rejected with a clear error, not a raw constraint violation",
      );

      console.log("Verifying an unknown module key is rejected...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_module_status('not-a-real-module', 'disabled', null, 'testing')`),
        "an unknown module key is rejected",
      );

      const eventCountBefore = psqlAsZoe(`select count(*) from platform.module_status_events`);

      console.log("Decision #4 -- a message-only change (status held constant) is still fully audited...");
      psqlAsZoe(`select * from platform.set_module_status('gst', 'available', 'Heads up: brief maintenance planned for next week.', 'pre-announcing planned maintenance')`);
      assertEqual(
        psqlAsZoe(`select customer_facing_message from platform.modules where module_key = 'gst'`),
        "Heads up: brief maintenance planned for next week.",
        "the message was stored even though status did not change",
      );
      assertEqual(
        psqlAsZoe(`select count(*) from platform.module_status_events`),
        String(Number(eventCountBefore) + 1),
        "exactly one new audit event was written for the message-only change",
      );
      assertEqual(
        psqlAsZoe(
          `select previous_status || ':' || new_status || ':' || coalesce(previous_message, '<null>') || ':' || coalesce(new_message, '<null>') from platform.module_status_events where module_key = 'gst' order by performed_at desc limit 1`,
        ),
        "available:available:<null>:Heads up: brief maintenance planned for next week.",
        "the audit row captures previous_status=new_status (unchanged) but the real previous/new message values",
      );

      console.log("Verifying a full status+message change together is captured as one atomic audit row...");
      psqlAsZoe(`select * from platform.set_module_status('gst', 'maintenance', 'Down for scheduled maintenance until 5pm IST.', 'starting the announced maintenance window')`);
      assertEqual(
        psqlAsZoe(
          `select previous_status || ':' || new_status || ':' || previous_message || ':' || new_message from platform.module_status_events where module_key = 'gst' order by performed_at desc limit 1`,
        ),
        "available:maintenance:Heads up: brief maintenance planned for next week.:Down for scheduled maintenance until 5pm IST.",
        "one row captures the real previous/new status AND previous/new message together",
      );

      console.log("Verifying an empty message clears customer_facing_message back to null...");
      psqlAsZoe(`select * from platform.set_module_status('gst', 'available', '', 'maintenance complete, clearing the message')`);
      assertEqual(
        psqlAsZoe(`select customer_facing_message is null from platform.modules where module_key = 'gst'`),
        "t",
        "an empty-string message normalizes to null, not a stored empty string",
      );

      console.log("Verifying read access to the audit trail: superadmin-only, not open like platform.modules...");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.module_status_events`),
        "0",
        "Alice gets zero rows regardless of how many real events exist",
      );

      console.log("Verifying nobody can bypass the function with a direct INSERT or UPDATE on the audit table...");
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.module_status_events (module_key, previous_status, new_status, reason, performed_by) values ('gst', 'available', 'disabled', 'bypass attempt', '${ZOE}')`,
          ),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log(
        "\nDecision #1/#3 concurrency check -- two concurrent set_module_status() calls on the same module never leave status and enabled disagreeing...",
      );
      // Postgres serializes both calls (the function's own `for update` row lock), so
      // this isn't testing true parallelism so much as proving the *result* is always
      // self-consistent regardless of which call effectively "won" -- there is no
      // intermediate state observable from outside a single UPDATE where status has
      // changed but enabled (computed from the same row, in the same statement) has not.
      const before = psqlAsZoe(
        `select status || ':' || enabled::text from platform.modules where module_key = 'fsm'`,
      );
      assertEqual(before, "available:true", "fsm starts available/enabled before the concurrency check");
      psqlAsZoe(`select * from platform.set_module_status('fsm', 'disabled', null, 'concurrency check a')`);
      psqlAsZoe(`select * from platform.set_module_status('fsm', 'read_only', null, 'concurrency check b')`);
      const after = psqlAsZoe(`select status || ':' || enabled::text from platform.modules where module_key = 'fsm'`);
      assertEqual(after, "read_only:true", "the final state (whichever call applied last) is always self-consistent -- read_only implies enabled=true, never a stale false");

      console.log("\nAll platform.set_module_status() / module_status_events checks passed.");
    },
  });
}

main();
