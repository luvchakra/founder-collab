#!/usr/bin/env node
/**
 * DB test for 20260908110000_core_payment_gateways.sql: price catalogue, subscriptions
 * mirror, webhook inbox lockdown, encrypted gateway accounts (column-level secrecy),
 * and core.record_gateway_payment() -- atomic, idempotent, tamper-checked recording of
 * an online payment into the ordinary payments ledger.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner
const BOB = "22222222-2222-2222-2222-222222222222"; // other tenant
const EVE = "55555555-5555-5555-5555-555555555555"; // viewer in Alice's business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_payment_gateways_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const alice = (sql) => psqlAs(ALICE, sql);
      const bob = (sql) => psqlAs(BOB, sql);
      const eve = (sql) => psqlAs(EVE, sql);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'), ('${EVE}', 'eve@example.com');
      `);
      const aliceAccount = psql(`select account_id from core.account_members where user_id = '${ALICE}'`);
      const business = psql(`insert into core.businesses (account_id, name) values ('${aliceAccount}', 'Alice Co') returning id;`);
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;
      `);
      psql(`
        insert into core.account_members (account_id, user_id, role) values ('${aliceAccount}', '${EVE}', 'member');
        insert into core.business_members (business_id, user_id, role) values
          ('${business}', '${ALICE}', 'owner'), ('${business}', '${EVE}', 'viewer'), ('${bobBusiness}', '${BOB}', 'owner');
      `);

      console.log("[1] Price catalogue...");
      psql(`
        insert into core.billing_prices (module_key, provider, currency, amount_minor, billing_interval, provider_price_id) values
          ('fsm', 'stripe', 'USD', 4900, 'month', 'price_fsm_usd'),
          ('fsm', 'razorpay', 'INR', 199900, 'month', 'plan_fsm_inr');
        insert into core.billing_prices (module_key, provider, currency, amount_minor, billing_interval, provider_price_id, is_active) values
          ('fsm', 'stripe', 'USD', 3900, 'month', 'price_fsm_old', false);
      `);
      assertEqual(bob("select count(*) from core.billing_prices"), "2", "any authenticated user sees active prices only");
      assertThrows(() => alice(`insert into core.billing_prices (module_key, provider, currency, amount_minor, billing_interval, provider_price_id) values ('crm', 'stripe', 'USD', 1, 'month', 'x')`), "clients can't write prices");
      assertThrows(() => psql(`insert into core.billing_prices (module_key, provider, currency, amount_minor, billing_interval, provider_price_id) values ('fsm', 'stripe', 'USD', 1, 'month', 'price_dup')`), "only one active price per module/provider/currency/interval");

      console.log("[2] Subscriptions mirror...");
      asService(`
        insert into core.subscriptions (account_id, business_id, module_key, provider, provider_subscription_id, status)
        values ('${aliceAccount}', '${business}', 'fsm', 'stripe', 'sub_1', 'incomplete');
        update core.subscriptions set status = 'active' where provider_subscription_id = 'sub_1';
      `);
      assertEqual(eve("select status from core.subscriptions"), "active", "members see their business's subscriptions");
      assertEqual(bob("select count(*) from core.subscriptions"), "0", "other tenants don't");
      assertThrows(() => alice(`update core.subscriptions set status = 'active'`), "clients can't write subscriptions (only signed webhooks can)");
      assertEqual(alice(`select count(*) from core.audit_log where action = 'subscription.status_changed'`), "2", "subscription creation and status change are audited");
      assertThrows(() => asService(`insert into core.subscriptions (account_id, business_id, module_key, provider, provider_subscription_id, status) values ('${aliceAccount}', '${business}', 'fsm', 'stripe', 'sub_1', 'active')`), "a provider subscription id is mirrored once");

      console.log("[3] Webhook inbox...");
      asService(`
        insert into core.payment_gateway_events (provider, provider_event_id, scope, event_type, payload, status, received_at)
        values ('stripe', 'evt_old', 'platform', 'x', '{"email": "payer@example.com"}', 'processed', now() - interval '100 days'),
               ('stripe', 'evt_new', 'platform', 'x', '{"email": "payer@example.com"}', 'processed', now());
      `);
      assertThrows(() => asService(`insert into core.payment_gateway_events (provider, provider_event_id, scope, event_type) values ('stripe', 'evt_new', 'platform', 'x')`), "an event id is recorded once (idempotency)");
      assertThrows(() => alice("select count(*) from core.payment_gateway_events"), "clients can't read the inbox (payloads contain payer PII)");
      assertEqual(asService("select core.purge_gateway_event_payloads()"), "1", "payloads older than 90 days are purged");
      assertEqual(psql("select count(*) from core.payment_gateway_events where payload is null"), "1", "...and only those");

      console.log("[4] Gateway accounts: column-level secrecy...");
      asService(`
        insert into core.payment_gateway_accounts (business_id, provider, key_id, encrypted_secret, encrypted_webhook_secret, secret_fingerprint)
        values ('${business}', 'razorpay', 'rzp_live_x', 'CIPHERTEXT', 'CIPHERTEXT2', 'abcd1234');
      `);
      assertEqual(alice("select key_id || '|' || secret_fingerprint from core.payment_gateway_accounts"), "rzp_live_x|abcd1234", "a billing manager sees the safe columns");
      assertThrows(() => alice("select encrypted_secret from core.payment_gateway_accounts"), "...but never the ciphertext");
      assertThrows(() => alice("select * from core.payment_gateway_accounts"), "...not even via select *");
      assertEqual(eve("select count(*) from core.payment_gateway_accounts"), "0", "a viewer (no billing.manage) sees nothing");
      assertEqual(bob("select count(*) from core.payment_gateway_accounts"), "0", "other tenants see nothing");
      assertThrows(() => alice(`delete from core.payment_gateway_accounts`), "clients can't modify gateway accounts");
      assertEqual(alice(`select count(*) from core.audit_log where action = 'payment_gateway.insert'`), "1", "connecting a gateway is audited (fingerprint only)");
      assertEqual(alice(`select after ? 'fingerprint' and not (after::text like '%CIPHERTEXT%') from core.audit_log where action = 'payment_gateway.insert'`), "t", "the audit entry carries no secret material");

      console.log("[5] record_gateway_payment...");
      const party = alice(`insert into core.parties (business_id, name) values ('${business}', 'Customer') returning id;`);
      const item = alice(`insert into core.items (business_id, name) values ('${business}', 'Widget') returning id;`);
      const invoice = alice(`
        insert into core.documents (business_id, doc_type, source_module, party_id, number)
        values ('${business}', 'invoice', 'fsm', '${party}', 'INV/0001') returning id;
      `);
      alice(`insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price) values ('${business}', '${invoice}', '${item}', 1, 1500);`);
      const request = asService(`
        insert into core.payment_requests (business_id, document_id, provider, provider_ref, amount, currency)
        values ('${business}', '${invoice}', 'razorpay', 'plink_1', 1500, 'INR') returning id;
      `);
      assertEqual(eve(`select status from core.payment_requests where id = '${request}'`), "created", "members can see payment requests");
      assertThrows(() => alice(`select core.record_gateway_payment('${request}', 'pay_1', 1500, 'INR')`), "clients can't record a gateway payment directly");
      assertThrows(() => asService(`select core.record_gateway_payment('${request}', 'pay_1', 1499, 'INR')`), "an amount that doesn't match the request is rejected");
      assertThrows(() => asService(`select core.record_gateway_payment('${request}', 'pay_1', 1500, 'USD')`), "a currency that doesn't match is rejected");
      const paymentId = asService(`select core.record_gateway_payment('${request}', 'pay_1', 1500, 'inr')`);
      assertEqual(alice(`select method || '|' || amount || '|' || gateway_payment_id from core.payments where id = '${paymentId}'`), "razorpay|1500.00|pay_1", "the payment lands in the ordinary ledger");
      assertEqual(alice(`select balance_amount from core.document_balances where document_id = '${invoice}'`), "0.00", "it's allocated to the invoice");
      assertEqual(alice(`select status || '|' || (payment_id = '${paymentId}') from core.payment_requests where id = '${request}'`), "paid|true", "the request is marked paid");
      assertEqual(alice(`select posted_at is not null from core.documents where id = '${invoice}'`), "t", "the paid invoice is auto-posted (financial controls)");
      assertEqual(asService(`select core.record_gateway_payment('${request}', 'pay_1', 1500, 'INR')`), paymentId, "a redelivered webhook returns the same payment (idempotent)");
      assertEqual(alice(`select count(*) from core.payments where gateway_payment_id = 'pay_1'`), "1", "...without recording it twice");
      assertThrows(() => asService(`insert into core.payments (business_id, party_id, method, amount, gateway_payment_id) values ('${business}', '${party}', 'razorpay', 1, 'pay_1')`), "the unique gateway id index backstops double-recording");
      assertEqual(alice(`select count(*) from core.audit_log where action = 'payment.recorded' and actor_id is null`), "1", "the webhook-recorded payment is audited as a system action");
      assertEqual(bob(`select count(*) from core.payments`), "0", "other tenants see none of it");

      console.log("\nAll payment-gateway checks passed.");
    },
  });
}

main();
