#!/usr/bin/env node
/**
 * RLS + behavior test for subscription billing (BILL-37 / BILL-38,
 * docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md §63-§66, §83-§89), run against the whole
 * migration timeline like every sibling platform.* test.
 *
 * What this proves:
 *   - platform.billing_providers (encrypted secrets) is unreadable to any signed-in user,
 *     superadmin included -- only billing_provider_status()'s masked view exists, and it
 *     refuses non-superadmins;
 *   - storing secrets records fingerprints only in the audit trail, never ciphertext, and
 *     switching test/live drops the stored secrets (§42);
 *   - a business's subscription is visible to its own members and to nobody else; its
 *     payments only to the account's owners and admins; no customer can write either;
 *   - billing_events are superadmin-only; checkout sessions are visible only to the user
 *     who started them;
 *   - plan prices are readable by signed-in users, writable by superadmins only, and
 *     every write lands in platform.audit_log;
 *   - a member cannot give their business a paid plan by editing business_settings.plan.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-9999999999a1"; // owner of Alice's account
const MIA = "99999999-9999-9999-9999-9999999999a2"; // plain member of Alice's account
const BOB = "99999999-9999-9999-9999-9999999999b1"; // owner of a different account
const ZOE = "99999999-9999-9999-9999-9999999999c1"; // platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_billing_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding two accounts, a plain member and a superadmin...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-billing@example.com'),
          ('${MIA}', 'mia-billing@example.com'),
          ('${BOB}', 'bob-billing@example.com'),
          ('${ZOE}', 'zoe-billing@example.com');
      `);
      const aliceAccount = psql(`select account_id from core.account_members where user_id = '${ALICE}'`);
      psql(`insert into core.account_members (account_id, user_id, role) values ('${aliceAccount}', '${MIA}', 'member')`);
      const aliceBiz = psql(`insert into core.businesses (account_id, name) values ('${aliceAccount}', 'Alice Co') returning id`);
      const bobBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;
      `);
      psql(`set local role service_role; insert into platform.admins (user_id) values ('${ZOE}');`);
      const pro = psql(`select id from platform.plans where key = 'pro'`);

      console.log("Provider configuration stays server-side...");
      assertThrows(() => psqlAs(ZOE, `select count(*) from platform.billing_providers`), "even a superadmin can't SELECT the providers table");
      assertThrows(() => psqlAs(ALICE, `select * from platform.billing_provider_status()`), "a customer can't read provider status");
      assertEqual(
        psqlAs(ZOE, `select string_agg(provider || ':' || secret_key_configured, ',' order by provider) from platform.billing_provider_status()`),
        "razorpay:false,stripe:false",
        "a superadmin sees the masked status",
      );
      assertThrows(
        () => psqlAs(ALICE, `select platform.set_billing_provider_secrets('stripe', 'x', 'fp', null, null, 'try')`),
        "a customer can't set provider secrets",
      );
      psqlAs(ZOE, `select platform.set_billing_provider_secrets('stripe', 'CIPHERTEXT-SK', 'abcd1234', 'CIPHERTEXT-WH', 'ef567890', 'initial keys')`);
      assertEqual(
        psqlAs(ZOE, `select secret_key_configured || ':' || secret_key_fingerprint from platform.billing_provider_status() where provider = 'stripe'`),
        "true:abcd1234",
        "status shows configured + fingerprint",
      );
      assertEqual(
        psql(`select count(*) from platform.billing_provider_events where new_value::text like '%CIPHERTEXT%' or previous_value::text like '%CIPHERTEXT%'`),
        "0",
        "the audit trail never holds a secret, even encrypted",
      );
      assertThrows(
        () => psqlAs(ZOE, `select platform.set_billing_provider_secrets('stripe', 'x', 'fp', null, null, '  ')`),
        "a reason is required",
      );
      psqlAs(ZOE, `select platform.update_billing_provider('stripe', false, 'live', 20, array['USD'], array[]::text[], null, null, 'go live')`);
      assertEqual(
        psql(`select (encrypted_secret_key is null and encrypted_webhook_secret is null)::text from platform.billing_providers where provider = 'stripe'`),
        "true",
        "switching test -> live drops the stored test secrets",
      );

      console.log("Subscriptions and payments are tenant-scoped...");
      const sub = psql(`
        set local role service_role;
        insert into platform.subscriptions (business_id, plan_id, provider, environment, provider_subscription_id, status)
        values ('${aliceBiz}', '${pro}', 'stripe', 'test', 'sub_alice', 'active') returning id;
      `);
      psql(`
        set local role service_role;
        insert into platform.billing_payments (business_id, subscription_id, provider, environment, provider_payment_id, amount, currency, status)
        values ('${aliceBiz}', '${sub}', 'stripe', 'test', 'pi_alice', 29, 'USD', 'succeeded');
      `);
      assertEqual(psqlAs(ALICE, `select count(*) from platform.subscriptions`), "1", "the owner sees her business's subscription");
      assertEqual(psqlAs(MIA, `select count(*) from platform.subscriptions`), "1", "a member sees which plan the business is on");
      assertEqual(psqlAs(BOB, `select count(*) from platform.subscriptions`), "0", "another account sees nothing");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.billing_payments`), "1", "the owner sees payments");
      assertEqual(psqlAs(MIA, `select count(*) from platform.billing_payments`), "0", "a plain member does not see payments");
      assertEqual(psqlAs(BOB, `select count(*) from platform.billing_payments`), "0", "another account sees no payments");
      assertThrows(
        () => psqlAs(ALICE, `update platform.subscriptions set status = 'active', plan_id = '${pro}'`),
        "a customer can't write their own subscription",
      );
      assertThrows(
        () => psqlAs(BOB, `insert into platform.subscriptions (business_id, plan_id, provider, status) values ('${bobBiz}', '${pro}', 'internal', 'active')`),
        "a customer can't grant themselves a subscription",
      );
      assertThrows(
        () => psql(`set local role service_role; insert into platform.subscriptions (business_id, plan_id, provider, status) values ('${aliceBiz}', '${pro}', 'internal', 'active')`),
        "one live subscription per business",
      );

      console.log("Webhook events and checkout sessions...");
      psql(`
        set local role service_role;
        insert into platform.billing_events (provider, environment, provider_event_id, event_type, payload_hash, payload, business_id)
        values ('stripe', 'test', 'evt_1', 'invoice.paid', 'h', '{}', '${aliceBiz}');
      `);
      assertThrows(
        () => psql(`set local role service_role; insert into platform.billing_events (provider, environment, provider_event_id, event_type, payload_hash, payload) values ('stripe', 'test', 'evt_1', 'invoice.paid', 'h', '{}')`),
        "the same provider event can't be stored twice",
      );
      assertEqual(psqlAs(ALICE, `select count(*) from platform.billing_events`), "0", "customers can't read webhook events");
      assertEqual(psqlAs(ZOE, `select count(*) from platform.billing_events`), "1", "a superadmin can");
      psql(`
        set local role service_role;
        insert into platform.checkout_sessions (business_id, plan_id, provider, environment, idempotency_key, requested_by)
        values ('${aliceBiz}', '${pro}', 'stripe', 'test', 'k1', '${ALICE}');
      `);
      assertEqual(psqlAs(ALICE, `select count(*) from platform.checkout_sessions`), "1", "the requester sees her checkout");
      assertEqual(psqlAs(MIA, `select count(*) from platform.checkout_sessions`), "0", "another member doesn't");
      assertThrows(
        () => psql(`set local role service_role; insert into platform.checkout_sessions (business_id, plan_id, provider, idempotency_key, requested_by) values ('${aliceBiz}', '${pro}', 'stripe', 'k1', '${ALICE}')`),
        "two tabs with one idempotency key share one session",
      );

      console.log("Plan prices...");
      assertEqual(psqlAs(ALICE, `select count(*) >= 0 from platform.plan_prices`), "t", "customers can read plan prices");
      assertThrows(
        () => psqlAs(ALICE, `insert into platform.plan_prices (plan_id, provider, environment, currency, billing_interval, amount, provider_price_id) values ('${pro}', 'stripe', 'test', 'USD', 'month', 1, 'price_cheap')`),
        "a customer can't create a price",
      );
      psqlAs(ZOE, `insert into platform.plan_prices (plan_id, provider, environment, currency, billing_interval, amount, provider_price_id) values ('${pro}', 'stripe', 'test', 'USD', 'month', 29, 'price_pro_usd')`);
      assertEqual(
        psql(`select count(*) from platform.audit_log where resource_type = 'plan_price' and actor_id = '${ZOE}'`),
        "1",
        "the price write is audited with its author",
      );
      assertThrows(
        () => psqlAs(ZOE, `insert into platform.plan_prices (plan_id, provider, environment, currency, billing_interval, amount, provider_price_id) values ('${pro}', 'stripe', 'test', 'USD', 'month', 30, 'price_pro_usd_2')`),
        "only one active price per plan/provider/environment/currency/interval",
      );

      console.log("The business plan can't be self-assigned...");
      assertThrows(
        () => psqlAs(ALICE, `update core.business_settings set plan = 'max' where business_id = '${aliceBiz}'`),
        "an owner can't set her own plan",
      );
      psql(`set local role service_role; update core.business_settings set plan = 'pro' where business_id = '${aliceBiz}'`);
      assertEqual(psql(`select plan from core.business_settings where business_id = '${aliceBiz}'`), "pro", "billing (service role) can");
      console.log("\nAll subscription billing RLS checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
