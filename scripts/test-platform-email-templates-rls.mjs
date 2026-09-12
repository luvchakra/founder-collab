#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.email_templates`/`platform.email_template_events`
 * (PLATFORM-P0-11.2, "System Email Templates", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §15). Same harness and bar every sibling `platform.*` migration in this
 * backlog has been held to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the catalog starts seeded with exactly the seven fixed template keys §15 names, all
 *     unconfigured (null subject/body) -- no fabricated copy;
 *   - a non-superadmin business admin sees zero rows on SELECT (RLS-filtered, not an
 *     error) and her mutation attempt is rejected by the function's own internal check,
 *     with zero residue on any row or in the audit trail;
 *   - a genuine superadmin can SELECT the catalog and successfully update one template's
 *     content via `update_email_template()`, which writes exactly one `content_updated`
 *     audit event scoped to that one template's own `template_key`, leaving every other
 *     template's row untouched;
 *   - an empty/whitespace reason is rejected even for a genuine superadmin;
 *   - an unknown template key is rejected by the function ("Unknown system email
 *     template");
 *   - even a genuine superadmin cannot INSERT an eighth row, DELETE any of the seven, or
 *     bypass `update_email_template()` with a direct UPDATE -- there is no such grant to
 *     `authenticated` at all;
 *   - `platform.email_template_events`' own SELECT is superadmin-only, matching every
 *     sibling audit table in this backlog.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-999999999993"; // business admin -- NOT a superadmin
const ZOE = "99999999-9999-9999-9999-999999999994"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_email_templates_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-email-templates@example.com'),
          ('${ZOE}', 'zoe-email-templates@example.com');
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

      console.log("Verifying the catalog starts seeded with exactly the seven fixed keys, all unconfigured...");
      assertEqual(
        psql(`select string_agg(template_key, ',' order by template_key) from platform.email_templates`),
        "compliance_reminders,password_security,subscription,system_announcements,usage_limits,verification,welcome",
        "all seven fixed template keys are seeded",
      );
      assertEqual(
        psql(`select count(*) from platform.email_templates where subject is not null or body is not null`),
        "0",
        "every template starts unconfigured -- no fabricated copy",
      );
      assertEqual(psql(`select count(*) from platform.email_template_events`), "0", "no events seeded");

      console.log("Verifying Alice (not a superadmin) cannot see the catalog at all...");
      assertEqual(psqlAsAlice(`select count(*) from platform.email_templates`), "0", "Alice's SELECT is RLS-filtered to zero rows, not an error");

      console.log("Verifying Alice's mutation attempt is rejected, with zero residue...");
      assertThrows(
        () => psqlAsAlice(`select platform.update_email_template('welcome', 'Hacked', 'hacked body', 'trying as non-superadmin')`),
        "Alice's update attempt is rejected by the function's own internal check",
      );
      assertEqual(
        psql(`set local role service_role; select subject is null from platform.email_templates where template_key = 'welcome'`),
        "t",
        "the welcome template is untouched by Alice's rejected attempt",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.email_template_events`), "0", "zero residue in the audit trail");

      console.log("Verifying a genuine superadmin (Zoe) can read and successfully update one template...");
      assertEqual(psqlAsZoe(`select count(*) from platform.email_templates`), "7", "Zoe can SELECT all seven rows");
      psqlAsZoe(
        `select platform.update_email_template('welcome', 'Welcome to WonderArc', 'Hi {{name}}, welcome aboard.', 'writing the first real copy')`,
      );
      assertEqual(
        psqlAsZoe(`select subject || '|' || body from platform.email_templates where template_key = 'welcome'`),
        "Welcome to WonderArc|Hi {{name}}, welcome aboard.",
        "the welcome template was updated with the exact content requested",
      );
      assertEqual(
        psqlAsZoe(`select count(*) from platform.email_templates where template_key != 'welcome' and (subject is not null or body is not null)`),
        "0",
        "every other template is untouched by this one update",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || template_key || ':' || coalesce(previous_value ->> 'subject', '<null>') || ':' || (new_value ->> 'subject') from platform.email_template_events order by performed_at desc limit 1`,
        ),
        "content_updated:welcome:<null>:Welcome to WonderArc",
        "exactly one 'content_updated' event, scoped to the welcome template, with a real before/after snapshot",
      );

      console.log("Verifying an empty/whitespace reason is rejected even for a genuine superadmin...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_email_template('verification', 'Verify your email', 'Click the link.', '')`),
        "a blank reason is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_email_template('verification', 'Verify your email', 'Click the link.', '   ')`),
        "a whitespace-only reason is rejected",
      );
      assertEqual(
        psqlAsZoe(`select subject is null from platform.email_templates where template_key = 'verification'`),
        "t",
        "verification untouched by the two rejected attempts above",
      );

      console.log("Verifying an unknown template key is rejected...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_email_template('not_a_real_template', 'x', 'y', 'trying an unknown key')`),
        "an unknown template key is rejected ('Unknown system email template')",
      );

      console.log("Verifying even a genuine superadmin cannot INSERT an 8th row, DELETE any row, or bypass the RPC with a direct UPDATE...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.email_templates (template_key, subject) values ('rogue_template', 'x')`),
        "even a superadmin cannot INSERT a new template key -- fixed catalog, no insert grant",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.email_templates where template_key = 'welcome'`),
        "even a superadmin cannot DELETE a template row -- no delete grant",
      );
      assertThrows(
        () => psqlAsZoe(`update platform.email_templates set subject = 'Bypassed' where template_key = 'welcome'`),
        "even a superadmin cannot UPDATE directly -- only the audited RPC can",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.email_templates`), "7", "still exactly seven rows");
      assertEqual(
        psql(`set local role service_role; select subject from platform.email_templates where template_key = 'welcome'`),
        "Welcome to WonderArc",
        "still the value Zoe's RPC call set, untouched by the bypass attempts",
      );

      console.log("Verifying platform.email_template_events' own SELECT is superadmin-only...");
      assertEqual(psqlAsAlice(`select count(*) from platform.email_template_events`), "0", "Alice cannot see the audit trail");
      assertEqual(psqlAsZoe(`select count(*) from platform.email_template_events`), "1", "Zoe can see the one real event");

      console.log("\nAll platform.email_templates / platform.email_template_events RLS checks passed.");
    },
  });
}

main();
