#!/usr/bin/env node
/**
 * DB test for PLATFORM-P1-05.3 (subscription tax settings) and PLATFORM-P1-05.4 (price
 * versioning), migration 20261010140000:
 *   - no tax by default; only a superadmin changes it, with a reason, audited;
 *   - a rate needs a name, rates are bounded, and the row can't be updated directly;
 *   - a subscription keeps pointing at its price row after that price is retired, and the
 *     row can't be deleted out from under it.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888895"; // business owner, not a superadmin
const ZOE = "88888888-8888-8888-8888-888888888896"; // superadmin

const setTax = (args) => `select platform.update_subscription_tax_settings(${args})`;

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_subscription_tax_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-tax@example.com'), ('${ZOE}', 'zoe-tax@example.com');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("Verifying subscription tax settings (PLATFORM-P1-05.3)...");
      assertEqual(
        psql(`select subscription_tax_label, subscription_tax_rate, subscription_prices_include_tax from platform.billing_settings`),
        "|0.00|t",
        "no tax by default",
      );
      assertThrows(() => psqlAs(ALICE, setTax(`'GST', 18, true, 'try'`)), "a business user is refused");
      assertThrows(() => psqlAs(ZOE, setTax(`'GST', 18, true, ''`)), "a blank reason is refused");
      assertThrows(() => psqlAs(ZOE, setTax(`'', 18, true, 'unnamed'`)), "a rate without a name is refused");
      assertThrows(() => psqlAs(ZOE, setTax(`'GST', 51, true, 'too high'`)), "a rate over 50% is refused");
      psqlAs(ZOE, setTax(`' GST ', 18, false, '18% GST added'`));
      assertEqual(
        psql(`select subscription_tax_label, subscription_tax_rate, subscription_prices_include_tax from platform.billing_settings`),
        "GST|18.00|f",
        "saved, name trimmed",
      );
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.billing_settings_events where reason = '18% GST added'`),
        "1",
        "audited",
      );
      assertThrows(() => psqlAs(ZOE, `update platform.billing_settings set subscription_tax_rate = 5`), "no direct update");
      assertEqual(psqlAs(ALICE, `select subscription_tax_rate from platform.billing_settings`), "18.00", "any signed-in user reads it (shown next to prices)");

      console.log("Verifying price versioning (PLATFORM-P1-05.4)...");
      const biz = psql(`insert into core.businesses (account_id, name) select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id`);
      const pro = psql(`select id from platform.plans where key = 'pro'`);
      const oldPrice = psql(`
        set local role service_role;
        insert into platform.plan_prices (plan_id, provider, environment, currency, billing_interval, amount, provider_price_id)
        values ('${pro}', 'razorpay', 'test', 'INR', 'month', 2999, 'plan_old') returning id`);
      const sub = psql(`
        set local role service_role;
        insert into platform.subscriptions (business_id, plan_id, provider, environment, status, amount, currency, billing_interval, plan_price_id)
        values ('${biz}', '${pro}', 'razorpay', 'test', 'active', 2999, 'INR', 'month', '${oldPrice}') returning id`);
      psql(`
        set local role service_role;
        update platform.plan_prices set active = false where id = '${oldPrice}';
        insert into platform.plan_prices (plan_id, provider, environment, currency, billing_interval, amount, provider_price_id)
        values ('${pro}', 'razorpay', 'test', 'INR', 'month', 3499, 'plan_new');`);
      assertEqual(
        psql(`set local role service_role; select pp.amount, pp.active from platform.subscriptions s join platform.plan_prices pp on pp.id = s.plan_price_id where s.id = '${sub}'`),
        "2999.00|f",
        "the subscription still points at the retired price it signed up on",
      );
      assertThrows(
        () => psql(`set local role service_role; delete from platform.plan_prices where id = '${oldPrice}'`),
        "a price a subscription is billed on can't be deleted",
      );

      console.log("\nAll subscription tax and price-version checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
