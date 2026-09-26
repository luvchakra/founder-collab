#!/usr/bin/env node
/**
 * RLS + behaviour test for PLATFORM-P1-04.2/04.3/04.4 and PLATFORM-P1-05.1/05.3/05.4
 * (20260927202000_platform_subscription_lifecycle.sql).
 *
 * What this proves:
 *   - only a superadmin can change trial/grace/currency/tax settings, a reason is required,
 *     and every change lands in billing_settings_events (Configuration History);
 *   - the ADR-9 30-day read-only grace is a floor, retention after lock can't be set below
 *     a year, a fixed subscription tax needs a rate and label, currencies must be ISO codes;
 *   - a recorded plan price can't be edited in place (05.4), only deactivated;
 *   - subscriptions stay tenant-isolated with the new past_due_since / plan_price_id columns.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-99999999d0a1";
const BOB = "99999999-9999-9999-9999-99999999d0b1";
const ZOE = "99999999-9999-9999-9999-99999999d0c1";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_lifecycle_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`insert into auth.users (id, email) values ('${ALICE}', 'a-lc@example.com'), ('${BOB}', 'b-lc@example.com'), ('${ZOE}', 'z-lc@example.com')`);
      const aliceBiz = psql(`insert into core.businesses (account_id, name) select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id`);
      psql(`insert into core.business_members (business_id, user_id, role) values ('${aliceBiz}', '${ALICE}', 'owner') on conflict do nothing`);
      psql(`set local role service_role; insert into platform.admins (user_id) values ('${ZOE}');`);
      const pro = psql(`select id from platform.plans where key = 'pro'`);

      console.log("Defaults keep today's behaviour...");
      assertEqual(
        psql(`select trial_days || ':' || feature_grace_days || ':' || tax_mode || ':' || array_to_string(supported_currencies, ',') from platform.billing_settings`),
        "0:30:provider:INR,USD,EUR,GBP",
        "no trials, 30-day grace, provider-calculated tax, the seeded providers' currencies",
      );

      console.log("Lifecycle settings (04.2/04.3/04.4)...");
      const lifecycle = (who, args) => psqlAs(who, `select platform.update_subscription_lifecycle(${args})`);
      assertThrows(() => lifecycle(ALICE, `14, array['${pro}']::uuid[], null, 7, 30, null, 'x'`), "a customer can't change the lifecycle");
      assertThrows(() => lifecycle(ZOE, `14, array['${pro}']::uuid[], null, 7, 30, null, ' '`), "a reason is required");
      assertThrows(() => lifecycle(ZOE, `14, array['${pro}']::uuid[], null, 7, 29, null, 'shorter'`), "the read-only grace can't drop below ADR-9's 30 days");
      assertThrows(() => lifecycle(ZOE, `14, array['${pro}']::uuid[], null, 7, 30, 30, 'purge fast'`), "retention after lock can't be under a year");
      assertThrows(() => lifecycle(ZOE, `14, array[gen_random_uuid()], null, 7, 30, null, 'x'`), "trial plans must exist");
      assertThrows(() => lifecycle(ZOE, `14, array['${pro}']::uuid[], array['nope'], 7, 30, null, 'x'`), "trial modules must exist");
      lifecycle(ZOE, `14, array['${pro}']::uuid[], array['discovery'], 5, 45, null, 'launch trials'`);
      assertEqual(
        psql(`select trial_days || ':' || payment_grace_days || ':' || feature_grace_days || ':' || array_to_string(trial_module_keys, ',') from platform.billing_settings`),
        "14:5:45:discovery",
        "a superadmin's change is stored",
      );
      assertEqual(
        psql(`select count(*) from platform.billing_settings_events where reason = 'launch trials' and performed_by = '${ZOE}' and new_value->>'trial_days' = '14'`),
        "1",
        "and recorded in billing_settings_events with its reason",
      );

      console.log("Currency and subscription tax (05.1/05.3)...");
      const config = (who, args) => psqlAs(who, `select platform.update_subscription_billing_config(${args})`);
      assertThrows(() => config(ALICE, `array['INR'], 'none', null, null, null, null, 'x'`), "a customer can't change billing config");
      assertThrows(() => config(ZOE, `array['INR'], 'exclusive', null, null, null, null, 'x'`), "a fixed tax needs a rate and label");
      assertThrows(() => config(ZOE, `array['rupees'], 'none', null, null, null, null, 'x'`), "currencies must be ISO codes");
      assertThrows(() => config(ZOE, `array[]::text[], 'none', null, null, null, null, 'x'`), "at least one currency");
      config(ZOE, `array['inr', ' usd '], 'exclusive', 'GST', 18, '29ABCDE1234F1Z5', 'in', 'register GST'`);
      assertEqual(
        psql(`select array_to_string(supported_currencies, ',') || ':' || tax_mode || ':' || tax_rate_percent || ':' || tax_country from platform.billing_settings`),
        "INR,USD:exclusive:18.00:IN",
        "currencies normalised, tax stored",
      );
      assertEqual(psqlAs(ALICE, `select tax_label from platform.billing_settings`), "GST", "customers can read the subscription tax they'll be shown");
      assertThrows(() => psqlAs(ZOE, `update platform.billing_settings set trial_days = 90`), "no direct writes, even for a superadmin");

      console.log("Price versioning (05.4)...");
      const price = psql(`insert into platform.plan_prices (plan_id, provider, environment, currency, billing_interval, amount, provider_price_id) values ('${pro}', 'stripe', 'test', 'USD', 'month', 29, 'price_v1') returning id`);
      assertThrows(() => psqlAs(ZOE, `update platform.plan_prices set amount = 39 where id = '${price}'`), "a recorded price's amount can't be edited");
      assertThrows(() => psql(`set local role service_role; update platform.plan_prices set provider_price_id = 'price_v2' where id = '${price}'`), "not even by the service role");
      psqlAs(ZOE, `update platform.plan_prices set active = false where id = '${price}'`);
      assertEqual(psql(`select active from platform.plan_prices where id = '${price}'`), "f", "deactivating is still allowed");
      const sub = psql(`
        set local role service_role;
        insert into platform.subscriptions (business_id, plan_id, provider, environment, provider_subscription_id, status, plan_price_id, amount, currency, past_due_since)
        values ('${aliceBiz}', '${pro}', 'stripe', 'test', 'sub_v1', 'past_due', '${price}', 29, 'USD', now()) returning id;
      `);
      assertEqual(psql(`select plan_price_id = '${price}' and amount = 29 from platform.subscriptions where id = '${sub}'`), "t", "the subscription keeps the price row it was sold on");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.subscriptions`), "1", "the business sees its subscription");
      assertEqual(psqlAs(BOB, `select count(*) from platform.subscriptions`), "0", "another tenant doesn't");

      console.log("\nAll subscription lifecycle checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
