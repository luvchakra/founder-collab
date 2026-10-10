#!/usr/bin/env node
/**
 * DB test for the subscription lifecycle settings (PLATFORM-P1-04.2 / PLATFORM-P1-04.3 /
 * PLATFORM-P1-04.4, migration 20261010130000):
 *   - defaults preserve today's behaviour (no trials, payment grace null, 30-day read-only);
 *   - only a superadmin can change them, always with a reason, and each change writes one
 *     platform.billing_settings_events row with before/after;
 *   - unknown plan keys, out-of-range days and a read-only period under 30 days (the public
 *     promise) are rejected;
 *   - nobody updates platform.billing_settings directly.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888893"; // not a superadmin
const ZOE = "88888888-8888-8888-8888-888888888894"; // superadmin

const update = (args) => `select platform.update_subscription_lifecycle_settings(${args})`;

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_lifecycle_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-lifecycle@example.com'), ('${ZOE}', 'zoe-lifecycle@example.com');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("Verifying defaults keep today's behaviour...");
      assertEqual(
        psql(`select trial_days, trial_plan_keys, trial_entitlements, coalesce(payment_grace_days::text, 'null'), feature_grace_days from platform.billing_settings`),
        "0|{}|plan|null|30",
        "no trials, payment grace until retries end, 30-day read-only period",
      );
      assertEqual(psql(`select count(*) from information_schema.columns where table_schema = 'platform' and table_name = 'subscriptions' and column_name = 'past_due_since'`), "1", "subscriptions.past_due_since exists");

      console.log("Verifying only a superadmin can change them, with a reason...");
      assertThrows(() => psqlAs(ALICE, update(`14, '{pro}', 'plan', 7, 30, 'try'`)), "a business user is refused");
      assertThrows(() => psqlAs(ZOE, update(`14, '{pro}', 'plan', 7, 30, ' '`)), "a blank reason is refused");
      psqlAs(ZOE, update(`14, '{pro}', 'all_modules', 7, 45, 'Offer a Pro trial'`));
      assertEqual(
        psql(`select trial_days, trial_plan_keys, trial_entitlements, payment_grace_days, feature_grace_days from platform.billing_settings`),
        "14|{pro}|all_modules|7|45",
        "settings saved",
      );
      assertEqual(
        psql(`set local role service_role; select count(*), max(reason), max((new_value->>'trial_days')) from platform.billing_settings_events`),
        "1|Offer a Pro trial|14",
        "one audit event with the reason and the new value",
      );

      console.log("Verifying invalid values are rejected...");
      assertThrows(() => psqlAs(ZOE, update(`14, '{no_such_plan}', 'plan', 7, 30, 'x'`)), "an unknown plan key is refused");
      assertThrows(() => psqlAs(ZOE, update(`14, '{pro}', 'plan', 7, 29, 'x'`)), "a read-only period under 30 days is refused");
      assertThrows(() => psqlAs(ZOE, update(`91, '{pro}', 'plan', 7, 30, 'x'`)), "a trial over 90 days is refused");
      assertThrows(() => psqlAs(ZOE, update(`14, '{pro}', 'plan', 61, 30, 'x'`)), "payment grace over 60 days is refused");
      assertThrows(() => psqlAs(ZOE, update(`14, '{pro}', 'everything', 7, 30, 'x'`)), "an unknown trial entitlement is refused");
      psqlAs(ZOE, update(`0, '{}', 'plan', null, 30, 'Back to defaults'`));
      assertEqual(psql(`select coalesce(payment_grace_days::text, 'null') from platform.billing_settings`), "null", "payment grace can be cleared");

      console.log("Verifying nobody updates the settings row directly...");
      assertThrows(() => psqlAs(ZOE, `update platform.billing_settings set trial_days = 60`), "a direct update by a superadmin is refused");
      assertEqual(psql(`select trial_days from platform.billing_settings`), "0", "and changed nothing");

      console.log("\nAll subscription lifecycle settings checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
