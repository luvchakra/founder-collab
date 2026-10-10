#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.ops_alerts` (PLATFORM-P1-07.4, "Operational Alerts",
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §29).
 *
 * What this proves:
 *   - only a superadmin can read alerts; a business admin sees none;
 *   - nobody -- a superadmin included -- writes the table directly or calls the two
 *     recording functions; they are service_role only (the ops-alerts cron);
 *   - record_ops_alerts() opens one episode per firing key, returns only newly opened
 *     episodes (so a re-run never re-emails), refreshes open ones, resolves keys that
 *     stopped firing, and opens a fresh episode when a resolved key fires again;
 *   - mark_ops_alert_notified() records the email outcome.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888891"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888892"; // platform superadmin

const asService = (sql) => `set local role service_role; ${sql}`;
const record = (alerts) =>
  asService(`select count(*) from platform.record_ops_alerts('${JSON.stringify(alerts)}'::jsonb)`);

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_ops_alerts_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-ops-alerts@example.com'),
          ('${ZOE}', 'zoe-ops-alerts@example.com');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("Verifying the table starts empty...");
      assertEqual(psql(asService(`select count(*) from platform.ops_alerts`)), "0", "no alerts seeded");

      const queueAlert = { key: "queue.domain_events.dead_letter", severity: "critical", message: "2 events failed", details: { failed: 2 } };
      const aiAlert = { key: "ai.failure_rate", severity: "warning", message: "AI failing", details: {} };

      console.log("Verifying only service_role can record alerts...");
      assertThrows(() => psqlAs(ALICE, `select * from platform.record_ops_alerts('[]'::jsonb)`), "a business admin can't call record_ops_alerts");
      assertThrows(() => psqlAs(ZOE, `select * from platform.record_ops_alerts('[]'::jsonb)`), "a superadmin can't call record_ops_alerts either");
      assertThrows(
        () => psqlAs(ZOE, `select platform.mark_ops_alert_notified(gen_random_uuid(), null)`),
        "a superadmin can't call mark_ops_alert_notified",
      );
      assertThrows(() => psql(asService(`select * from platform.record_ops_alerts('{}'::jsonb)`)), "a non-array payload is rejected");

      console.log("Verifying episodes open once and re-runs don't reopen them...");
      assertEqual(psql(record([queueAlert, aiAlert])), "2", "first run opens two episodes");
      assertEqual(psql(record([queueAlert, aiAlert])), "0", "an identical re-run opens nothing (no repeat email)");
      assertEqual(psql(asService(`select count(*) from platform.ops_alerts where resolved_at is null`)), "2", "both still open");

      console.log("Verifying a key that stops firing is resolved...");
      assertEqual(psql(record([queueAlert])), "0", "dropping the AI alert opens nothing");
      assertEqual(
        psql(asService(`select resolved_at is not null from platform.ops_alerts where alert_key = 'ai.failure_rate'`)),
        "t",
        "the AI episode is resolved",
      );

      console.log("Verifying a resolved key that fires again opens a new episode...");
      assertEqual(psql(record([queueAlert, aiAlert])), "1", "the AI alert reopens as a new episode");
      assertEqual(psql(asService(`select count(*) from platform.ops_alerts where alert_key = 'ai.failure_rate'`)), "2", "two AI episodes in history");

      console.log("Verifying refreshes update the open episode's message...");
      psql(record([{ ...queueAlert, message: "5 events failed" }, aiAlert]));
      assertEqual(
        psql(asService(`select message from platform.ops_alerts where alert_key = 'queue.domain_events.dead_letter' and resolved_at is null`)),
        "5 events failed",
        "open episode carries the latest message",
      );

      console.log("Verifying mark_ops_alert_notified...");
      const id = psql(asService(`select id from platform.ops_alerts where alert_key = 'queue.domain_events.dead_letter'`));
      psql(asService(`select platform.mark_ops_alert_notified('${id}', null)`));
      assertEqual(psql(asService(`select notified_at is not null and notify_error is null from platform.ops_alerts where id = '${id}'`)), "t", "notified");
      psql(asService(`select platform.mark_ops_alert_notified('${id}', 'Email isn''t configured.')`));
      assertEqual(psql(asService(`select notify_error from platform.ops_alerts where id = '${id}'`)), "Email isn't configured.", "error recorded");

      console.log("Verifying read access: superadmin yes, business admin no...");
      assertEqual(psqlAs(ZOE, `select count(*) from platform.ops_alerts`), "3", "Zoe reads every episode");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.ops_alerts`), "0", "Alice reads none");

      console.log("Verifying nobody writes the table directly...");
      assertThrows(
        () => psqlAs(ZOE, `insert into platform.ops_alerts (alert_key, severity, message) values ('x', 'warning', 'm')`),
        "a superadmin can't insert directly",
      );
      assertThrows(() => psqlAs(ZOE, `update platform.ops_alerts set resolved_at = now()`), "a superadmin can't update directly");
      assertThrows(() => psqlAs(ZOE, `delete from platform.ops_alerts`), "a superadmin can't delete directly");
      assertThrows(() => psqlAs(ALICE, `insert into platform.ops_alerts (alert_key, severity, message) values ('x', 'warning', 'm')`), "a business admin can't insert");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
