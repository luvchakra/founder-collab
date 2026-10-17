#!/usr/bin/env node
/**
 * DISC-AI-APPROVAL-01 (supabase/migrations/20261017100000_discovery_ai_approval_mode.sql):
 * core.business_settings.discovery_ai_approval_mode.
 *
 *   - defaults to 'review' for a new business, and only 'review'/'auto' are accepted;
 *   - only a member with business.settings.manage (owner, admin) can change it -- a sales
 *     manager (discovery.manage, but not settings) and a viewer cannot;
 *   - tenant isolation: another business's owner can neither read nor change it;
 *   - every change writes one core.audit_log entry, through core.write_audit_log(), with the
 *     real actor and the old/new value -- including a service-role write;
 *   - discovery.pipeline_runs accepts the new 'awaiting_approval' status.
 *
 * Licence gating: this is a column on core's own per-business settings row, which isn't a
 * licensed table; the Discovery licence is checked by the setting's server action
 * (requireModule) -- see lib/ai-approval/mutations.test.ts.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const OWEN = "88888888-8888-8888-8888-8888888888a1"; // owner of A
const ADA = "88888888-8888-8888-8888-8888888888a2"; // admin in A
const SAL = "88888888-8888-8888-8888-8888888888a3"; // sales manager in A
const VIC = "88888888-8888-8888-8888-8888888888a4"; // viewer in A
const BETH = "88888888-8888-8888-8888-8888888888b1"; // owner of B

async function main() {
  await withTestDatabase({
    dbNamePrefix: "discovery_ai_approval_mode_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding two businesses and their members...");
      psql(`
        insert into auth.users (id, email) values
          ('${OWEN}', 'e2e-qa-owen@example.com'), ('${ADA}', 'e2e-qa-ada@example.com'),
          ('${SAL}', 'e2e-qa-sal@example.com'), ('${VIC}', 'e2e-qa-vic@example.com'),
          ('${BETH}', 'e2e-qa-beth@example.com');
      `);
      const bizA = psql(`insert into core.businesses (account_id, name) select account_id, 'Business A' from core.account_members where user_id = '${OWEN}' returning id`);
      const bizB = psql(`insert into core.businesses (account_id, name) select account_id, 'Business B' from core.account_members where user_id = '${BETH}' returning id`);
      psqlAs(OWEN, `insert into core.business_members (business_id, user_id, role) values ('${bizA}', '${OWEN}', 'owner')`);
      psqlAs(BETH, `insert into core.business_members (business_id, user_id, role) values ('${bizB}', '${BETH}', 'owner')`);
      psql(`
        insert into core.business_members (business_id, user_id, role) values
          ('${bizA}', '${ADA}', 'admin'), ('${bizA}', '${SAL}', 'sales_manager'), ('${bizA}', '${VIC}', 'viewer');
        insert into core.licenses (account_id, business_id, module_key, status)
        select b.account_id, b.id, 'discovery', 'active' from core.businesses b where b.id in ('${bizA}', '${bizB}');
      `);

      const mode = (who, biz) => psqlAs(who, `select discovery_ai_approval_mode from core.business_settings where business_id = '${biz}'`);
      const setMode = (who, biz, value) =>
        psqlAs(who, `update core.business_settings set discovery_ai_approval_mode = '${value}' where business_id = '${biz}' returning business_id`);
      const auditCount = (biz) =>
        psql(`select count(*) from core.audit_log where business_id = '${biz}' and action = 'discovery.ai_approval_mode_changed'`);

      console.log("Default and allowed values...");
      assertEqual(mode(OWEN, bizA), "review", "a new business defaults to 'Review each step'");
      assertEqual(
        psql(`select column_default from information_schema.columns where table_schema = 'core' and table_name = 'business_settings' and column_name = 'discovery_ai_approval_mode'`),
        "'review'::text",
        "the column default (which also filled every existing row) is 'review'",
      );
      assertThrows(() => setMode(OWEN, bizA, "always"), "a value other than review/auto is rejected");

      console.log("Who can change it...");
      assertEqual(setMode(SAL, bizA, "auto"), "", "a sales manager (discovery.manage, no settings permission) changes nothing");
      assertEqual(setMode(VIC, bizA, "auto"), "", "a viewer changes nothing");
      assertEqual(mode(VIC, bizA), "review", "...but every member can read the current mode");
      assertEqual(auditCount(bizA), "0", "refused attempts write no audit entry");
      assertEqual(setMode(ADA, bizA, "auto"), bizA, "an admin (business.settings.manage) can change it");
      assertEqual(mode(OWEN, bizA), "auto", "the change is saved");
      assertEqual(setMode(OWEN, bizA, "review"), bizA, "the owner can change it back");

      console.log("Tenant isolation...");
      assertEqual(mode(BETH, bizA), "", "another business's owner can't read it");
      assertEqual(setMode(BETH, bizA, "auto"), "", "another business's owner can't change it");
      assertEqual(mode(OWEN, bizA), "review", "business A's mode is untouched by business B");
      assertEqual(mode(BETH, bizB), "review", "business B has its own row, still at the default");

      console.log("Audit trail...");
      assertEqual(auditCount(bizA), "2", "each real change wrote exactly one audit entry");
      assertEqual(
        psql(`select actor_id || ':' || (before->>'discovery_ai_approval_mode') || '->' || (after->>'discovery_ai_approval_mode') from core.audit_log where business_id = '${bizA}' and action = 'discovery.ai_approval_mode_changed' order by created_at, id limit 1`),
        `${ADA}:review->auto`,
        "the entry names the real actor and the old and new value",
      );
      psqlAs(OWEN, `update core.business_settings set timezone = 'UTC' where business_id = '${bizA}'`);
      assertEqual(auditCount(bizA), "2", "changing another setting doesn't log an approval-mode change");
      psql(`set local role service_role; update core.business_settings set discovery_ai_approval_mode = 'auto' where business_id = '${bizB}'`);
      assertEqual(auditCount(bizB), "1", "a service-role change is audited too (trigger, not app code)");
      assertEqual(psqlAs(BETH, `select count(*) from core.audit_log where action = 'discovery.ai_approval_mode_changed'`), "1", "Beth sees only her own business's entries");

      console.log("Pipeline runs can wait for approval...");
      assertEqual(
        psql(`select pg_get_constraintdef(oid) like '%awaiting_approval%' from pg_constraint where conname = 'pipeline_runs_status_check' and conrelid = 'discovery.pipeline_runs'::regclass`),
        "t",
        "discovery.pipeline_runs.status accepts 'awaiting_approval'",
      );

      console.log("\nAll DISC-AI-APPROVAL-01 checks passed.");
    },
  });
}

main();
