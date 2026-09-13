#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.audit_log`, `platform.write_platform_audit_log()`,
 * and the six new triggers (PLATFORM-P0-16.1/16.2/16.3, "Platform Audit",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §20 --
 * `20260913480000_platform_audit_log.sql`). Same harness and bar every sibling
 * `platform.*` migration in this backlog has been held to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - `platform.audit_log` is superadmin-only to SELECT -- an ordinary authenticated user
 *     (not a superadmin) gets zero rows even when rows exist (the `anon`-cannot-read-the-
 *     schema-at-all case is proven live against dev instead, matching every sibling
 *     script's own convention -- none of them assert an `anon` role locally either);
 *   - `platform.write_platform_audit_log()` has NO grant to `authenticated` at all -- a
 *     non-superadmin (or even a superadmin) calling it DIRECTLY is rejected outright. This
 *     is the exact hole this story's own role-switched verification against dev found and
 *     fixed before merge (see this story's own dated audit-log entry) -- an authenticated
 *     user could otherwise forge an arbitrary audit_log row (any actor_id, any
 *     resource_type, any severity) by calling the writer function themselves;
 *   - despite that function having no grant to `authenticated`, a genuine superadmin's own
 *     ordinary INSERT/UPDATE on the newly-audited tables (compliance_countries here; the
 *     same trigger shape covers compliance_packs/pack_features and
 *     plan_features/plan_limits/plan_modules identically) still writes exactly one
 *     `platform.audit_log` row per statement, with the real actor, action, before/after
 *     JSONB snapshot, and 'high' severity -- proving the SECURITY DEFINER trigger
 *     functions really do run with their owner's privileges rather than the caller's;
 *   - a non-superadmin's attempt at the same table is still rejected by its own
 *     PRE-EXISTING RLS policy (this migration changed none of them) -- with zero residue
 *     in either the base table or `platform.audit_log`;
 *   - the composite-key resource types (`plan_feature`/`plan_limit`/`plan_module`) encode
 *     `resource_id` as `"<plan_id>:<the other key column>"`, matching
 *     `platform-audit-log.ts`'s own trigger SQL exactly;
 *   - a DELETE on a newly-audited table that actually grants DELETE (`plan_limits`, via
 *     `clearPlanLimit()`) records `action = 'deleted'`. `compliance_countries` has no
 *     DELETE grant at all (by design -- "disable, never remove", the same stance
 *     `platform.plans` already established), confirmed live when this test first tried
 *     one there and got a real `permission denied`, not a bug in this migration.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888893"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888894"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_audit_log_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-audit-log@example.com'),
          ('${ZOE}', 'zoe-audit-log@example.com');
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

      console.log("Verifying platform.audit_log starts empty...");
      assertEqual(psql(`select count(*) from platform.audit_log`), "0", "no audit_log rows before any tested mutation");

      console.log("Verifying write_platform_audit_log() has NO grant to authenticated -- not even for a real superadmin...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.write_platform_audit_log(null, 'created', 'forged', 'x', 'high', 'fake', null, '{}'::jsonb)`,
          ),
        "a superadmin cannot call the writer function directly -- it has no EXECUTE grant to authenticated at all",
      );
      assertThrows(
        () =>
          psqlAsAlice(
            `select platform.write_platform_audit_log(null, 'created', 'forged', 'x', 'high', 'fake', null, '{}'::jsonb)`,
          ),
        "a non-superadmin cannot call it either -- the same denial, not a superadmin-specific check",
      );
      assertEqual(psql(`select count(*) from platform.audit_log`), "0", "zero residue from either rejected direct call");

      console.log("Verifying a genuine superadmin's ordinary compliance_countries INSERT/UPDATE writes real audit_log rows via the trigger...");
      // No DELETE here: compliance_countries has no DELETE grant/policy at all, by design
      // (that migration's own docstring: "disable, never remove", same stance
      // platform.plans already established) -- confirmed live when this test first
      // attempted one and got a real `permission denied for table compliance_countries`,
      // not a bug in this migration. The DELETE-path assertion below uses plan_limits
      // instead, which genuinely does have a DELETE grant (clearPlanLimit()).
      psqlAsZoe(`insert into platform.compliance_countries (country_code, name, enabled) values ('ZZ', 'Test Land', true)`);
      psqlAsZoe(`update platform.compliance_countries set enabled = false where country_code = 'ZZ'`);
      assertEqual(
        psqlAsZoe(`select string_agg(action, ',' order by performed_at asc) from platform.audit_log where resource_type = 'compliance_country' and resource_id = 'ZZ'`),
        "created,updated",
        "exactly one audit_log row per statement, in order, via the SECURITY DEFINER trigger -- despite Zoe having no direct grant on the writer function",
      );
      assertEqual(
        psqlAsZoe(`select severity from platform.audit_log where resource_type = 'compliance_country' and action = 'created'`),
        "high",
        "'compliance rule changes' are severity 'high', per 16.2's own mandatory list",
      );
      assertEqual(
        psqlAsZoe(`select (new_value ->> 'enabled') from platform.audit_log where resource_type = 'compliance_country' and action = 'created'`),
        "true",
        "the create event's own new_value snapshot carries the real inserted row",
      );
      assertEqual(
        psqlAsZoe(`select (previous_value ->> 'enabled') || ':' || (new_value ->> 'enabled') from platform.audit_log where resource_type = 'compliance_country' and action = 'updated'`),
        "true:false",
        "the update event's before/after snapshot captures the real transition",
      );
      console.log("Verifying Alice's (non-superadmin) attempt at the same table is rejected by the table's own pre-existing RLS, with zero new audit_log residue...");
      assertThrows(
        () => psqlAsAlice(`insert into platform.compliance_countries (country_code, name, enabled) values ('YY', 'Hijack Land', true)`),
        "Alice cannot insert into compliance_countries -- unchanged pre-existing RLS, this migration touched no policy on that table",
      );
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.compliance_countries where country_code = 'YY'`),
        "0",
        "zero residue in the base table from Alice's rejected insert",
      );

      console.log("Verifying platform.audit_log is superadmin-only to SELECT...");
      assertEqual(psqlAsAlice(`select count(*) from platform.audit_log`), "0", "Alice gets zero rows even though real rows exist");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.audit_log`).toString(), "t", "Zoe (superadmin) can read them");

      console.log("Verifying a composite-key resource type (plan_module) encodes resource_id as '<plan_id>:<module_key>'...");
      const proId = psql(`select id from platform.plans where key = 'pro'`);
      psqlAsZoe(`update platform.plan_modules set enabled = false where plan_id = '${proId}' and module_key = 'discovery'`);
      assertEqual(
        psqlAsZoe(`select resource_id from platform.audit_log where resource_type = 'plan_module' order by performed_at desc limit 1`),
        `${proId}:discovery`,
        "resource_id is '<plan_id>:<module_key>', matching platform-audit-log.ts's own AuditResourceType shape exactly",
      );
      assertEqual(
        psqlAsZoe(`select severity from platform.audit_log where resource_type = 'plan_module' order by performed_at desc limit 1`),
        "high",
        "'entitlement changes' are severity 'high', per 16.2's own mandatory list",
      );

      console.log("Verifying plan_limits (a DELETE-capable entitlement table) records a 'deleted' event on clearPlanLimit()'s own DELETE...");
      psqlAsZoe(`insert into platform.plan_limits (plan_id, resource_key, state, limit_type, limit_value) values ('${proId}', 'businesses', 'limited', 'hard', 5)`);
      psqlAsZoe(`delete from platform.plan_limits where plan_id = '${proId}' and resource_key = 'businesses'`);
      assertEqual(
        psqlAsZoe(`select action from platform.audit_log where resource_type = 'plan_limit' and resource_id = '${proId}:businesses' order by performed_at desc limit 1`),
        "deleted",
        "the DELETE on plan_limits is captured as a 'deleted' audit_log event",
      );

      console.log("\nAll platform.audit_log / write_platform_audit_log / trigger checks passed.");
    },
  });
}

main();
