#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.integrations`, `platform.integration_status_events`,
 * and `platform.set_integration_status()` -- PLATFORM-P0-12.1/12.2/12.3/12.4 ("Global
 * Integrations", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §16). See the migration's
 * own docstring (`20260912430000_platform_integrations.sql`) for the full design
 * reasoning this script proves against a real database, not just reads from the SQL:
 *   - the registry is readable by ANY authenticated user (12.1/12.2 -- "show" status), but
 *     only a real SUPERADMIN can ever change it (12.3's kill switch is dangerous).
 *   - `enabled` is a GENERATED ALWAYS column, structurally derived from `status`, never
 *     independently settable -- even by service_role.
 *   - a reason is required unconditionally, in every direction, not only when disabling.
 *   - `platform.integration_status_events` is superadmin-only to read, and nobody --
 *     including a real superadmin -- can bypass `set_integration_status()` with a direct
 *     INSERT.
 *   - the seven-row catalog is fixed: no authenticated grant exists to INSERT a new
 *     integration or DELETE an existing one.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888881"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888882"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_integrations_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-integrations@example.com'),
          ('${ZOE}', 'zoe-integrations@example.com');
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

      console.log("12.1 -- the registry is seeded with exactly the seven §16.1 categories...");
      assertEqual(
        psqlAsZoe(`select array_to_string(array_agg(integration_key order by integration_key), ',') from platform.integrations`),
        "ai,analytics,email,government,payments,storage,whatsapp",
        "all seven categories exist, seeded once by the migration",
      );

      console.log("12.1/12.2 -- open SELECT for ANY authenticated user, not superadmin-only...");
      assertEqual(psqlAsAlice(`select count(*) from platform.integrations`), "7", "Alice (not a superadmin) can read the full registry");

      console.log("Decision (this migration's own header comment) -- enabled is a generated column, structurally derived from status...");
      for (const [status, expectedEnabled] of [
        ["connected", "true"],
        ["disconnected", "true"],
        ["error", "true"],
        ["needs_reauthorization", "true"],
        ["disabled", "false"],
      ]) {
        psqlAsZoe(`select * from platform.set_integration_status('whatsapp', '${status}', null, 'exercising ${status}')`);
        assertEqual(
          psqlAsZoe(`select enabled::text from platform.integrations where integration_key = 'whatsapp'`),
          expectedEnabled,
          `status='${status}' => enabled=${expectedEnabled} (derived, not independently settable)`,
        );
      }
      assertThrows(
        () => psql(`set local role service_role; update platform.integrations set enabled = true where integration_key = 'whatsapp'`),
        "enabled cannot be assigned directly at all -- it is GENERATED ALWAYS, even for service_role",
      );

      console.log("Resetting whatsapp back to connected for the remaining checks...");
      psqlAsZoe(`select * from platform.set_integration_status('whatsapp', 'connected', null, 'reset for further testing')`);

      console.log("12.3 -- a business admin (not a superadmin) is rejected by the function's own check, the kill switch is not reachable by them...");
      assertThrows(
        () => psqlAsAlice(`select * from platform.set_integration_status('whatsapp', 'disabled', null, 'trying to kill whatsapp')`),
        "Alice's call is rejected by the function's own internal platform.is_superadmin() check",
      );
      assertEqual(
        psql(`set local role service_role; select status from platform.integrations where integration_key = 'whatsapp'`),
        "connected",
        "whatsapp is still connected -- Alice's rejected call changed nothing",
      );

      console.log("Verifying an empty/whitespace reason is rejected for every status, not only disabling...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_integration_status('whatsapp', 'connected', null, '')`),
        "an empty reason is rejected even for a no-op-looking 'set to connected' transition",
      );
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_integration_status('email', 'connected', null, '   ')`),
        "a whitespace-only reason is rejected",
      );

      console.log("Verifying an unknown status value is rejected by the function's own check...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_integration_status('whatsapp', 'paused', null, 'testing')`),
        "an unknown status is rejected with a clear error, not a raw constraint violation",
      );

      console.log("Verifying an unknown integration key is rejected...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.set_integration_status('not-a-real-integration', 'disabled', null, 'testing')`),
        "an unknown integration key is rejected",
      );

      const eventCountBefore = psqlAsZoe(`select count(*) from platform.integration_status_events`);

      console.log("12.3 -- a real superadmin CAN flip the emergency kill switch, and it is fully audited...");
      psqlAsZoe(`select * from platform.set_integration_status('whatsapp', 'disabled', 'Meta API outage', 'emergency kill switch during a widespread outage')`);
      assertEqual(
        psqlAsZoe(`select status || ':' || enabled::text from platform.integrations where integration_key = 'whatsapp'`),
        "disabled:false",
        "Zoe's call succeeded -- whatsapp is now disabled and unreachable platform-wide",
      );
      assertEqual(
        psqlAsZoe(`select count(*) from platform.integration_status_events`),
        String(Number(eventCountBefore) + 1),
        "exactly one new audit event was written for the kill-switch transition",
      );
      assertEqual(
        psqlAsZoe(
          `select previous_status || ':' || new_status || ':' || coalesce(previous_notes, '<null>') || ':' || coalesce(new_notes, '<null>') from platform.integration_status_events where integration_key = 'whatsapp' order by performed_at desc limit 1`,
        ),
        "connected:disabled:<null>:Meta API outage",
        "the audit row captures the real previous/new status AND previous/new notes together",
      );

      console.log("Resetting whatsapp back to connected...");
      psqlAsZoe(`select * from platform.set_integration_status('whatsapp', 'connected', '', 'incident resolved, re-enabling')`);
      assertEqual(
        psqlAsZoe(`select notes is null from platform.integrations where integration_key = 'whatsapp'`),
        "t",
        "an empty-string notes value normalizes to null, not a stored empty string",
      );

      console.log("12.4 -- the registry stores no credential of any kind (structural enforcement of Credential Separation)...");
      // Excludes `integration_key` (this table's own primary key/identity column -- an
      // enum-shaped category slug like 'whatsapp', not a secret, the same way
      // `platform.ai_providers.provider`/`platform.modules.module_key` are identity
      // columns) and `credential_ownership` (12.4's own enum METADATA column -- describes
      // WHO owns the real credential, e.g. 'customer_owned', it does not store one). The
      // real check is for anything resembling an actual secret column, which the
      // migration's own docstring promises this table has zero of.
      assertEqual(
        psqlAsZoe(
          `select count(*) from information_schema.columns where table_schema = 'platform' and table_name = 'integrations' and column_name not in ('integration_key', 'credential_ownership') and column_name ~* 'key|secret|token|password|credential'`,
        ),
        "0",
        "no column on platform.integrations (other than its own key/slug and the ownership-metadata enum) even resembles a credential column",
      );

      console.log("Verifying read access to the audit trail: superadmin-only, not open like platform.integrations...");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.integration_status_events`),
        "0",
        "Alice gets zero rows regardless of how many real events exist",
      );

      console.log("Verifying nobody can bypass the function with a direct INSERT on the audit table...");
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.integration_status_events (integration_key, previous_status, new_status, reason, performed_by) values ('whatsapp', 'connected', 'disabled', 'bypass attempt', '${ZOE}')`,
          ),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("Verifying the seven-row catalog is fixed -- no authenticated grant to INSERT a new category or DELETE an existing one...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.integrations (integration_key, display_name, credential_ownership) values ('sms', 'SMS', 'customer_owned')`),
        "even a superadmin cannot INSERT a new integration row -- no such grant exists to authenticated",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.integrations where integration_key = 'storage'`),
        "even a superadmin cannot DELETE an integration row -- no such grant exists to authenticated",
      );

      console.log("Verifying a direct UPDATE bypassing the function is also rejected (no UPDATE grant to authenticated)...");
      assertThrows(
        () => psqlAsZoe(`update platform.integrations set status = 'disabled' where integration_key = 'email'`),
        "even a superadmin cannot UPDATE platform.integrations directly -- set_integration_status() is the only path",
      );

      console.log("\nAll platform.integrations / set_integration_status() / integration_status_events checks passed.");
    },
  });
}

main();
