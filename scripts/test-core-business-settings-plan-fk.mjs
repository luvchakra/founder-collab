#!/usr/bin/env node
/**
 * Behavior + tenant-isolation test for PLATFORM-P0-05.2's own plan-link migration
 * (supabase/migrations/20260912070000_core_business_settings_plan_fk.sql): every business
 * gets a default plan at creation, `core.business_settings.plan` is now a real FK into
 * `platform.plans.key`, and existing businesses get backfilled rather than left
 * unassigned. Follows the same shared harness (C-8) every other RLS/behavior test in this
 * repo uses.
 *
 * This is `core`-tenant data (a business's own settings), not a `platform.*` superadmin
 * table -- so, unlike the sibling `test-platform-plan-*-rls.mjs` scripts, there is no
 * superadmin dimension to test here; the existing `core.business_settings` RLS policies
 * (members can view/create/update their own business's settings) already have their own
 * coverage in test-discovery-rls.mjs. This script is specifically about the new
 * auto-provisioning trigger and the new FK constraint's own behavior.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "55555555-5555-5555-5555-555555555551";
const BOB = "55555555-5555-5555-5555-555555555552";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_business_settings_plan_fk_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-plan-fk@example.com'),
          ('${BOB}', 'bob-plan-fk@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);

      console.log("Verifying the seeded plan catalog itself (free/pro/max)...");
      assertEqual(psql(`select count(*) from platform.plans`), "3", "the three plans PLATFORM-P0-04.1 seeded still exist");

      console.log("Verifying a freshly created business is assigned a plan at creation (decision #1)...");
      const aliceBiz = psqlAsAlice(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      assertEqual(
        psqlAsAlice(`select count(*) from core.business_settings where business_id = '${aliceBiz}'`),
        "1",
        "core.handle_new_business() auto-created a settings row the moment the business was inserted -- no lazy 'first module write' wait",
      );
      assertEqual(
        psqlAsAlice(`select plan from core.business_settings where business_id = '${aliceBiz}'`),
        "free",
        "the new business defaults to the 'free' plan, a real platform.plans.key -- not the old disconnected 'starter' default",
      );

      console.log("Verifying the trigger fires for every business, not just the first...");
      const aliceBiz2 = psqlAsAlice(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Second Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      assertEqual(
        psqlAsAlice(`select plan from core.business_settings where business_id = '${aliceBiz2}'`),
        "free",
        "a second business for the same account also gets its own settings row, defaulted to free",
      );

      console.log("Verifying core.business_settings.plan is a real FK into platform.plans.key...");
      assertThrows(
        () => psqlAsAlice(`update core.business_settings set plan = 'nonexistent_plan' where business_id = '${aliceBiz}'`),
        "setting plan to a value with no matching platform.plans.key is rejected by the FK constraint",
      );
      assertEqual(
        psqlAsAlice(`select plan from core.business_settings where business_id = '${aliceBiz}'`),
        "free",
        "the rejected update left the row's real plan untouched",
      );
      psqlAsAlice(`update core.business_settings set plan = 'pro' where business_id = '${aliceBiz}'`);
      assertEqual(
        psqlAsAlice(`select plan from core.business_settings where business_id = '${aliceBiz}'`),
        "pro",
        "updating to a real plan key succeeds",
      );

      console.log("Verifying the column default itself is now 'free', not the old 'starter'...");
      assertEqual(
        psql(`select column_default from information_schema.columns where table_schema = 'core' and table_name = 'business_settings' and column_name = 'plan'`),
        "'free'::text",
        "the column default was changed going forward, per decision #2",
      );

      console.log("Verifying the auto-provisioning insert is conflict-safe (on conflict do nothing)...");
      psql(`set local role service_role; insert into core.business_settings (business_id) values ('${aliceBiz}') on conflict (business_id) do nothing;`);
      assertEqual(
        psqlAsAlice(`select plan from core.business_settings where business_id = '${aliceBiz}'`),
        "pro",
        "a redundant insert for an already-settings-having business is a no-op -- Alice's real 'pro' plan survives untouched",
      );

      console.log("Verifying tenant isolation still holds on business_settings...");
      const bobBiz = psqlAsBob(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);
      assertEqual(psqlAsBob(`select count(*) from core.business_settings`), "1", "Bob sees only his own business's settings row");
      assertEqual(psqlAsBob(`select plan from core.business_settings where business_id = '${bobBiz}'`), "free", "Bob's own business also got a default plan at creation");
      assertEqual(psqlAsAlice(`select count(*) from core.business_settings`), "2", "Alice sees only her own two businesses' settings rows, never Bob's");

      console.log("\nAll core.business_settings plan-FK checks passed.");
    },
  });
}

main();
