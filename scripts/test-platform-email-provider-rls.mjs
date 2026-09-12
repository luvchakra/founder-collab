#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.email_provider`/`platform.email_provider_events`
 * (PLATFORM-P0-11.1, "Email Provider", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §15).
 * Same harness and bar every sibling `platform.*` migration in this backlog has been held
 * to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the singleton row starts seeded unconfigured (provider/from_email/reply_to all
 *     null) -- no fabricated "on" state;
 *   - a non-superadmin business admin sees zero rows on SELECT (RLS-filtered, not an
 *     error) and her mutation attempt is rejected by the function's own internal check,
 *     with zero residue on the row or in the audit trail;
 *   - a genuine superadmin can SELECT the row and successfully update it via
 *     `update_email_provider_config()`, which writes exactly one `config_updated` audit
 *     event with a real before/after snapshot;
 *   - an empty/whitespace reason is rejected by the mutation function for a superadmin too
 *     -- "a reason is required" is not merely a non-superadmin's problem;
 *   - a malformed from_email/reply_to is rejected by the table's own CHECK constraint even
 *     when submitted by a genuine superadmin through the RPC (defense in depth under the
 *     database itself, not only the app's Zod schema);
 *   - even a genuine superadmin cannot INSERT a second row, DELETE the singleton, or bypass
 *     `update_email_provider_config()` with a direct UPDATE -- there is no such grant to
 *     `authenticated` at all;
 *   - `platform.email_provider_events`' own SELECT is superadmin-only, matching every
 *     sibling audit table in this backlog.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-999999999991"; // business admin -- NOT a superadmin
const ZOE = "99999999-9999-9999-9999-999999999992"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_email_provider_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-email-provider@example.com'),
          ('${ZOE}', 'zoe-email-provider@example.com');
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

      console.log("Verifying the singleton row starts seeded unconfigured...");
      assertEqual(
        psql(`set local role service_role; select coalesce(provider, 'null') || ':' || coalesce(from_email, 'null') || ':' || coalesce(reply_to, 'null') from platform.email_provider where id = true`),
        "null:null:null",
        "provider/from_email/reply_to all start null -- no fabricated 'configured' state",
      );
      assertEqual(psql(`select count(*) from platform.email_provider_events`), "0", "no events seeded");

      console.log("Verifying Alice (not a superadmin) cannot see the config row at all...");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.email_provider`),
        "0",
        "Alice's SELECT is RLS-filtered to zero rows, not an error",
      );

      console.log("Verifying Alice's mutation attempt is rejected, with zero residue...");
      assertThrows(
        () =>
          psqlAsAlice(
            `select platform.update_email_provider_config('SendGrid', 'notifications@wonderarc.com', 'support@wonderarc.com', 'trying as non-superadmin')`,
          ),
        "Alice's update attempt is rejected by the function's own internal check",
      );
      assertEqual(
        psql(`set local role service_role; select provider is null from platform.email_provider where id = true`),
        "t",
        "the row is untouched by Alice's rejected attempt",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.email_provider_events`), "0", "zero residue in the audit trail");

      console.log("Verifying a genuine superadmin (Zoe) can read and successfully update the config...");
      assertEqual(psqlAsZoe(`select count(*) from platform.email_provider`), "1", "Zoe can SELECT the one config row");
      psqlAsZoe(
        `select platform.update_email_provider_config('Resend', 'notifications@wonderarc.com', 'support@wonderarc.com', 'recording our real ESP after launch review')`,
      );
      assertEqual(
        psqlAsZoe(`select provider || ':' || from_email || ':' || reply_to from platform.email_provider where id = true`),
        "Resend:notifications@wonderarc.com:support@wonderarc.com",
        "the config was updated with the exact values requested",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || coalesce(previous_value ->> 'provider', '<null>') || ':' || (new_value ->> 'provider') from platform.email_provider_events order by performed_at desc limit 1`,
        ),
        "config_updated:<null>:Resend",
        "exactly one 'config_updated' event with a real before (null provider) / after snapshot",
      );

      console.log("Verifying an empty/whitespace reason is rejected even for a genuine superadmin...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_email_provider_config('SendGrid', 'a@b.com', null, '')`),
        "a blank reason is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_email_provider_config('SendGrid', 'a@b.com', null, '   ')`),
        "a whitespace-only reason is rejected",
      );
      assertEqual(psqlAsZoe(`select provider from platform.email_provider where id = true`), "Resend", "untouched by the two rejected attempts above");

      console.log("Verifying the from_email/reply_to CHECK constraints reject a malformed address even via the RPC...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_email_provider_config('Resend', 'not-an-email', null, 'trying a malformed from_email')`),
        "a malformed from_email is rejected by the table's own CHECK constraint",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_email_provider_config('Resend', 'notifications@wonderarc.com', 'also not an email', 'trying a malformed reply_to')`),
        "a malformed reply_to is rejected by the table's own CHECK constraint",
      );

      console.log("Verifying even a genuine superadmin cannot INSERT a 2nd row, DELETE the singleton, or bypass the RPC with a direct UPDATE...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.email_provider (id, provider) values (false, 'Rogue')`),
        "even a superadmin cannot INSERT into platform.email_provider -- no INSERT policy or grant to authenticated",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.email_provider where id = true`),
        "even a superadmin cannot DELETE the singleton row -- no DELETE policy or grant to authenticated",
      );
      assertThrows(
        () => psqlAsZoe(`update platform.email_provider set provider = 'Bypassed' where id = true`),
        "even a superadmin cannot UPDATE directly -- no UPDATE policy or grant to authenticated, only the audited RPC",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.email_provider`), "1", "still exactly one row");
      assertEqual(psql(`set local role service_role; select provider from platform.email_provider where id = true`), "Resend", "still the value Zoe's RPC call set, untouched by the bypass attempts");

      console.log("Verifying platform.email_provider_events' own SELECT is superadmin-only...");
      assertEqual(psqlAsAlice(`select count(*) from platform.email_provider_events`), "0", "Alice cannot see the audit trail");
      assertEqual(psqlAsZoe(`select count(*) from platform.email_provider_events`), "1", "Zoe can see the one real event");

      console.log("\nAll platform.email_provider / platform.email_provider_events RLS checks passed.");
    },
  });
}

main();
