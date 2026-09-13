#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.system_policies`/`platform.system_policy_events`
 * (PLATFORM-P0-14.1/14.2/14.3, "Platform Policies", CONFIG-ONLY,
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §18). Same harness and bar every sibling
 * `platform.*` migration in this backlog has been held to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the singleton row is seeded with exactly the real values this codebase already
 *     enforces/defaults elsewhere (password_min_length=8, default_timezone='Asia/Kolkata',
 *     default_currency='INR', rate_limit_api_per_minute=120) and every other field left
 *     unconfigured (null) -- no fabricated ceiling;
 *   - a non-superadmin can read the open policy row but her mutation attempt is rejected
 *     by the function's own internal check, with zero residue in either table;
 *   - a genuine superadmin can set the full policy, which writes exactly one atomic audit
 *     event carrying a real before/after snapshot, and the default currency is
 *     upper-cased;
 *   - a missing/non-positive value for any required field (password min length, default
 *     timezone/currency, API rate limit) is rejected;
 *   - a non-positive value for any nullable ceiling/rate-limit/retention field is rejected
 *     by the table's own CHECK constraints;
 *   - an empty/whitespace reason is rejected;
 *   - clearing every nullable field back to "not configured" is a valid, honest state;
 *   - the audit trail's own SELECT is superadmin-only;
 *   - nobody -- including a superadmin -- can bypass the function with a direct
 *     INSERT/UPDATE/DELETE on either table.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888897"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888898"; // real platform superadmin

// (session_duration, password_min_length, uppercase, number, symbol, max_file_size,
//  timezone, currency, data_retention, audit_retention, api, ai, webhooks, imports,
//  exports, automation, reason)
const FULL_POLICY_ARGS = `120, 12, true, true, true, 50, 'America/New_York', 'usd', 400, 800, 200, 40, 80, 15, 15, 25, 'setting a full platform policy'`;

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_system_policies_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-system-policy@example.com'),
          ('${ZOE}', 'zoe-system-policy@example.com');
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

      console.log("Verifying the singleton row starts seeded with exactly the real values this codebase already enforces/defaults elsewhere, everything else unconfigured...");
      assertEqual(psql(`select count(*) from platform.system_policies`), "1", "exactly one system-policy row exists");
      assertEqual(
        psql(
          `select password_min_length::text || ':' || default_timezone || ':' || default_currency || ':' || rate_limit_api_per_minute::text || ':' || (session_duration_minutes is null)::text || ':' || (max_file_size_mb is null)::text || ':' || (data_retention_default_days is null)::text || ':' || (audit_retention_days is null)::text || ':' || (rate_limit_ai_per_minute is null)::text from platform.system_policies`,
        ),
        "8:Asia/Kolkata:INR:120:true:true:true:true:true",
        "password_min_length=8, default_timezone/currency=Asia/Kolkata/INR, rate_limit_api_per_minute=120, everything else unconfigured",
      );
      assertEqual(
        psql(`select password_require_uppercase::text || ':' || password_require_number::text || ':' || password_require_symbol::text from platform.system_policies`),
        "false:false:false",
        "no complexity requirement fabricated -- matches today's real, unenforced behavior",
      );
      assertEqual(psql(`select count(*) from platform.system_policy_events`), "0", "no events seeded");

      console.log("Verifying Alice (not a superadmin) can read the open policy but can't change it...");
      assertEqual(psqlAsAlice(`select count(*) from platform.system_policies`), "1", "Alice can read the singleton row");
      assertThrows(
        () => psqlAsAlice(`select platform.update_system_policies(${FULL_POLICY_ARGS.replace("'setting a full platform policy'", "'Alice trying to change policy'")})`),
        "Alice's policy-update attempt is rejected by the function's own internal check",
      );
      assertEqual(
        psql(`set local role service_role; select rate_limit_api_per_minute from platform.system_policies`).toString(),
        "120",
        "the policy is untouched by Alice's rejected attempt",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.system_policy_events`), "0", "zero residue in the audit trail");

      console.log("Verifying a genuine superadmin (Zoe) can set the full policy, and the default currency is upper-cased...");
      psqlAsZoe(`select platform.update_system_policies(${FULL_POLICY_ARGS})`);
      assertEqual(
        psqlAsZoe(
          `select session_duration_minutes::text || ':' || password_min_length::text || ':' || max_file_size_mb::text || ':' || default_timezone || ':' || default_currency || ':' || data_retention_default_days::text || ':' || audit_retention_days::text || ':' || rate_limit_api_per_minute::text || ':' || rate_limit_ai_per_minute::text || ':' || rate_limit_webhooks_per_minute::text || ':' || rate_limit_imports_per_hour::text || ':' || rate_limit_exports_per_hour::text || ':' || rate_limit_automation_per_minute::text from platform.system_policies`,
        ),
        "120:12:50:America/New_York:USD:400:800:200:40:80:15:15:25",
        "the policy was updated with the exact values requested, currency upper-cased",
      );
      assertEqual(
        psqlAsZoe(
          `select (previous_value ->> 'rate_limit_api_per_minute') || ':' || (new_value ->> 'rate_limit_api_per_minute') from platform.system_policy_events order by performed_at desc limit 1`,
        ),
        "120:200",
        "exactly one audit event with a real before/after snapshot",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.system_policy_events`), "1", "exactly one event so far");

      console.log("Verifying a missing/empty required field is rejected...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, null, true, true, true, null, 'Asia/Kolkata', 'INR', null, null, 120, null, null, null, null, null, 'missing password min length')`),
        "a null password_min_length is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 8, true, true, true, null, '', 'INR', null, null, 120, null, null, null, null, null, 'blank timezone')`),
        "a blank default_timezone is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 8, true, true, true, null, 'Asia/Kolkata', '', null, null, 120, null, null, null, null, null, 'blank currency')`),
        "a blank default_currency is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 8, true, true, true, null, 'Asia/Kolkata', 'INR', null, null, null, null, null, null, null, null, 'missing api rate limit')`),
        "a null rate_limit_api_per_minute is rejected",
      );

      console.log("Verifying non-positive values are rejected by the table's own CHECK constraints...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(0, 8, true, true, true, null, 'Asia/Kolkata', 'INR', null, null, 120, null, null, null, null, null, 'zero session duration')`),
        "a zero session_duration_minutes is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 0, true, true, true, null, 'Asia/Kolkata', 'INR', null, null, 120, null, null, null, null, null, 'zero password min length')`),
        "a zero password_min_length is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 8, true, true, true, null, 'Asia/Kolkata', 'INR', -1, null, 120, null, null, null, null, null, 'negative retention')`),
        "a negative data_retention_default_days is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 8, true, true, true, null, 'Asia/Kolkata', 'INR', null, null, -5, null, null, null, null, null, 'negative api rate limit')`),
        "a negative rate_limit_api_per_minute is rejected",
      );

      console.log("Verifying an empty/whitespace reason is rejected...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 8, true, true, true, null, 'Asia/Kolkata', 'INR', null, null, 120, null, null, null, null, null, '')`),
        "an empty reason is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_system_policies(null, 8, true, true, true, null, 'Asia/Kolkata', 'INR', null, null, 120, null, null, null, null, null, '   ')`),
        "a whitespace-only reason is rejected",
      );

      console.log("Verifying clearing every nullable field back to 'not configured' is a valid, honest state...");
      psqlAsZoe(`select platform.update_system_policies(null, 8, false, false, false, null, 'Asia/Kolkata', 'INR', null, null, 120, null, null, null, null, null, 'reverting to platform defaults')`);
      assertEqual(
        psqlAsZoe(
          `select (session_duration_minutes is null)::text || ':' || (max_file_size_mb is null)::text || ':' || (data_retention_default_days is null)::text || ':' || (rate_limit_ai_per_minute is null)::text from platform.system_policies`,
        ),
        "true:true:true:true",
        "the policy can be cleared back to no ceiling configured on every optional field",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.system_policy_events`), "2", "the clear itself is also audited");

      console.log("Verifying read access to the audit trail: superadmin-only, unlike the open policy row...");
      assertEqual(psqlAsAlice(`select count(*) from platform.system_policy_events`), "0", "Alice gets zero rows from the audit trail (RLS-filtered, not an error)");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.system_policy_events`).toString(), "t", "Zoe (superadmin) can read it");

      console.log("Verifying nobody -- including a superadmin -- can bypass the function with a direct write...");
      assertThrows(
        () => psqlAsZoe(`update platform.system_policies set rate_limit_api_per_minute = 500 where id = true`),
        "even a superadmin cannot UPDATE platform.system_policies directly -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.system_policies (id) values (false)`),
        "even a superadmin cannot INSERT a second row -- no grant exists (and the boolean PK would reject it anyway)",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.system_policies where id = true`),
        "even a superadmin cannot DELETE the singleton row -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.system_policy_events (previous_value, new_value, reason) values ('{}'::jsonb, '{}'::jsonb, 'bypass attempt')`),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("\nAll platform.system_policies / platform.system_policy_events checks passed.");
    },
  });
}

main();
