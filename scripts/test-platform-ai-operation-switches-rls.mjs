#!/usr/bin/env node
/**
 * RLS + behaviour test for PLATFORM-P0-10.4 ("AI Feature Kill Switch",
 * 20260927200000_platform_ai_operation_switches.sql).
 *
 * What this proves:
 *   - any signed-in user can read which AI features are switched off (the model routers
 *     run with the caller's session), but nobody can write the table directly;
 *   - only a superadmin can switch a feature, a reason is required, the operation name is
 *     validated;
 *   - every switch is recorded in platform.audit_log with actor, reason and before/after,
 *     and that audit trail is superadmin-only.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-99999999f0a1"; // ordinary business owner
const ZOE = "99999999-9999-9999-9999-99999999f0c1"; // platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_ai_switches_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`insert into auth.users (id, email) values ('${ALICE}', 'a-sw@example.com'), ('${ZOE}', 'z-sw@example.com')`);
      psql(`set local role service_role; insert into platform.admins (user_id) values ('${ZOE}');`);

      console.log("Only a superadmin can switch an AI feature...");
      assertThrows(() => psqlAs(ALICE, `select platform.set_ai_operation_enabled('chat', false, 'no')`), "a customer can't switch an AI feature");
      assertThrows(() => psqlAs(ZOE, `select platform.set_ai_operation_enabled('chat', false, ' ')`), "a reason is required");
      assertThrows(() => psqlAs(ZOE, `select platform.set_ai_operation_enabled('Chat; drop', false, 'x')`), "the operation name is validated");
      assertThrows(
        () => psqlAs(ZOE, `insert into platform.ai_operation_switches (operation, enabled, reason) values ('chat', false, 'x')`),
        "no direct inserts, even for a superadmin",
      );

      psqlAs(ZOE, `select platform.set_ai_operation_enabled('chat', false, 'provider outage')`);
      assertEqual(psqlAs(ALICE, `select enabled from platform.ai_operation_switches where operation = 'chat'`), "f", "any signed-in user can read the switch");
      assertEqual(psql(`select updated_by from platform.ai_operation_switches where operation = 'chat'`), ZOE, "the switch records who flipped it");
      assertThrows(() => psqlAs(ALICE, `update platform.ai_operation_switches set enabled = true`), "a customer can't flip it back directly");
      assertThrows(() => psqlAs(ZOE, `delete from platform.ai_operation_switches`), "switch rows are never deleted");

      psqlAs(ZOE, `select platform.set_ai_operation_enabled('chat', true, 'recovered')`);
      assertEqual(psqlAs(ALICE, `select enabled from platform.ai_operation_switches where operation = 'chat'`), "t", "switching back on is one call");

      console.log("Every switch is audited...");
      assertEqual(
        psql(`select string_agg(action || ':' || reason || ':' || severity, ',' order by performed_at) from platform.audit_log where resource_type = 'ai_operation_switch'`),
        "created:provider outage:high,updated:recovered:high",
        "each switch lands in platform.audit_log with its reason",
      );
      assertEqual(
        psql(`select (previous_value->>'enabled') || '->' || (new_value->>'enabled') from platform.audit_log where resource_type = 'ai_operation_switch' and action = 'updated'`),
        "false->true",
        "with before/after values",
      );
      assertEqual(psqlAs(ALICE, `select count(*) from platform.audit_log`), "0", "customers can't read the platform audit log");

      console.log("\nAll AI feature kill switch checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
