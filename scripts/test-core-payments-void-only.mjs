#!/usr/bin/env node
/**
 * SEC-7: void-only payments (20261002090000_core_payments_void_only.sql), via the shared
 * harness (C-8). Proves recorded payments and allocations can't be edited or deleted by
 * anyone, that core.void_payment() is the one way out -- permission, maker-checker,
 * reason, once only, tenant-scoped -- that a void reopens the documents it had settled,
 * leaves a full audit entry and publishes `payment.voided` for Finance, and that deleting
 * a whole business still cascades.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner
const BOB = "22222222-2222-2222-2222-222222222222"; // owner of another business
const CAROL = "33333333-3333-3333-3333-333333333333"; // sales manager in Alice's business
const DAVE = "44444444-4444-4444-4444-444444444444"; // accountant in Alice's business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_payments_void_only_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const alice = (sql) => psqlAs(ALICE, sql);
      const bob = (sql) => psqlAs(BOB, sql);
      const carol = (sql) => psqlAs(CAROL, sql);
      const dave = (sql) => psqlAs(DAVE, sql);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com'), ('${DAVE}', 'dave@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        revoke delete on core.payments from authenticated;
        revoke update, delete on core.payment_allocations from authenticated;
      `);
      const business = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;`);
      const bobBusiness = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;`);
      psql(`
        insert into core.business_members (business_id, user_id, role) values
          ('${business}', '${ALICE}', 'owner'), ('${business}', '${CAROL}', 'sales_manager'),
          ('${business}', '${DAVE}', 'accountant'), ('${bobBusiness}', '${BOB}', 'owner')
        on conflict do nothing;
      `);
      const customer = alice(`insert into core.parties (business_id, name) values ('${business}', 'Customer') returning id;`);
      const invoice = (total) => {
        const doc = alice(`insert into core.documents (business_id, doc_type, source_module, party_id)
          values ('${business}', 'invoice', 'fsm', '${customer}') returning id;`);
        const item = alice(`insert into core.items (business_id, name) values ('${business}', 'Item ${total}') returning id;`);
        alice(`insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price)
          values ('${business}', '${doc}', '${item}', 1, ${total});`);
        return doc;
      };
      const invoiceA = invoice(600);
      const invoiceB = invoice(400);
      const record = (as, amount) =>
        as(`insert into core.payments (business_id, party_id, method, amount, reference)
          values ('${business}', '${customer}', 'bank', ${amount}, 'UTR-${amount}') returning id;`);
      const allocate = (as, payment, doc, amount) =>
        as(`insert into core.payment_allocations (business_id, payment_id, document_id, amount)
          values ('${business}', '${payment}', '${doc}', ${amount}) returning id;`);

      // Carol records one payment settling both invoices.
      const payment = record(carol, 1000);
      const allocA = allocate(carol, payment, invoiceA, 600);
      const allocB = allocate(carol, payment, invoiceB, 400);
      const balance = (doc) => alice(`select balance_amount from core.document_balances where document_id = '${doc}'`);
      assertEqual(balance(invoiceA), "0.00", "the payment settles invoice A");

      console.log("[1] Recorded payments and allocations are immutable...");
      assertThrows(() => alice(`update core.payments set amount = 1 where id = '${payment}'`), "the owner can't change a recorded amount");
      assertThrows(() => alice(`update core.payments set payment_date = '2020-01-01' where id = '${payment}'`), "...or its date");
      assertThrows(() => asService(`update core.payments set reference = 'x' where id = '${payment}'`), "...nor can the service role change its reference");
      alice(`update core.payments set notes = 'paid by NEFT' where id = '${payment}'`);
      assertEqual(alice(`select notes from core.payments where id = '${payment}'`), "paid by NEFT", "notes stay editable");
      assertThrows(() => alice(`update core.payments set voided_at = now(), void_reason = 'sneaky' where id = '${payment}'`), "a payment can't be voided by a plain update");
      assertThrows(() => alice(`delete from core.payments where id = '${payment}'`), "a member can't delete a payment");
      assertThrows(() => asService(`delete from core.payments where id = '${payment}'`), "the service role can't delete a payment");
      assertThrows(() => psql(`delete from core.payments where id = '${payment}'`), "even the table owner is stopped by the trigger");
      assertThrows(() => asService(`update core.payment_allocations set amount = 1 where id = '${allocA}'`), "an allocation can't be changed");
      assertThrows(() => asService(`delete from core.payment_allocations where id = '${allocA}'`), "an allocation can't be deleted");
      assertThrows(() => asService(`set local core.voiding_payment = '${payment}'; update core.payments set voided_at = now() where id = '${payment}';`), "setting the void flag by hand doesn't let a client role void outside void_payment()");
      assertThrows(() => asService(`set local core.voiding_payment = '${payment}'; delete from core.payment_allocations where id = '${allocA}';`), "...or release an allocation");
      assertThrows(() => alice(`insert into core.payments (business_id, party_id, method, amount, voided_at) values ('${business}', '${customer}', 'cash', 5, now())`), "a payment can't be recorded already voided");
      assertEqual(alice(`select count(*) from core.payment_allocations where payment_id = '${payment}'`), "2", "both allocations are still there");

      console.log("[2] Who may void...");
      assertThrows(() => bob(`select core.void_payment('${payment}', 'customer bounced')`), "another tenant can't void it (or learn it exists)");
      assertThrows(() => carol(`select core.void_payment('${payment}', 'customer bounced')`), "a role without payments.void can't void it");
      const ownPayment = record(dave, 50);
      assertThrows(() => dave(`select core.void_payment('${ownPayment}', 'entered twice')`), "maker-checker: the accountant can't void a payment they recorded themselves");
      assertThrows(() => dave(`select core.void_payment('${payment}', 'no')`), "a reason is required");
      const ownerPayment = record(alice, 25);
      alice(`select core.void_payment('${ownerPayment}', 'entered twice')`);
      assertEqual(alice(`select voided_by from core.payments where id = '${ownerPayment}'`), ALICE, "an owner may void their own payment (a one-person business has nobody else)");

      console.log("[3] A void releases what the payment settled, once...");
      const released = dave(`select core.void_payment('${payment}', '  cheque bounced  ')`);
      assertEqual(
        JSON.parse(released).map((a) => `${a.document_id === invoiceA ? "A" : "B"}:${a.amount}`).join(","),
        "A:600,B:400",
        "void_payment returns what the payment had settled",
      );
      assertEqual(
        alice(`select (voided_at is not null) || '|' || voided_by || '|' || void_reason from core.payments where id = '${payment}'`),
        `true|${DAVE}|cheque bounced`,
        "the payment is stamped voided, by whom and why",
      );
      assertEqual(alice(`select count(*) from core.payments where id = '${payment}'`), "1", "the payment row itself is kept");
      assertEqual(alice(`select jsonb_array_length(voided_allocations) from core.payments where id = '${payment}'`), "2", "a snapshot of the released allocations is kept on the payment");
      assertEqual(balance(invoiceA), "600.00", "invoice A is owed again");
      assertEqual(balance(invoiceB), "400.00", "invoice B is owed again");
      assertThrows(() => alice(`select core.void_payment('${payment}', 'again please')`), "a payment is voided only once");
      assertThrows(() => allocate(alice, payment, invoiceA, 10), "a voided payment can't be allocated again");
      assertThrows(() => psql(`update core.payments set void_reason = 'rewritten' where id = '${payment}'`), "the void itself can't be rewritten");

      console.log("[4] ...with an audit entry and an event for Finance...");
      assertEqual(
        alice(`select actor_id || '|' || (before ->> 'amount') || '|' || jsonb_array_length(before -> 'allocations') || '|' || (after ->> 'reason')
               from core.audit_log where action = 'payment.voided' and entity_id = '${payment}'`),
        `${DAVE}|1000.00|2|cheque bounced`,
        "the audit entry records who, the full before-image and the reason",
      );
      assertEqual(
        psql(`select required_module || '|' || status || '|' || (payload ->> 'paymentId') from core.domain_events where type = 'payment.voided' and payload ->> 'paymentId' = '${payment}'`),
        `gst|pending|${payment}`,
        "a payment.voided event is queued for Finance",
      );
      assertEqual(
        psql(`select string_agg(id::text, ',' order by id) from (select jsonb_array_elements_text(payload -> 'allocationIds') as id from core.domain_events where payload ->> 'paymentId' = '${payment}') x`),
        [allocA, allocB].sort().join(","),
        "the event names every released allocation, so Finance can reverse each settlement",
      );

      console.log("[5] Tenant isolation...");
      assertEqual(bob(`select count(*) from core.payments where business_id = '${business}'`), "0", "Bob sees none of Alice's payments, voided or not");

      console.log("[6] Deleting a whole business still cascades...");
      const bobCustomer = bob(`insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bob Customer') returning id;`);
      const bobItem = bob(`insert into core.items (business_id, name) values ('${bobBusiness}', 'Thing') returning id;`);
      const bobInvoice = bob(`insert into core.documents (business_id, doc_type, source_module, party_id)
        values ('${bobBusiness}', 'invoice', 'fsm', '${bobCustomer}') returning id;`);
      bob(`insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price) values ('${bobBusiness}', '${bobInvoice}', '${bobItem}', 1, 100);`);
      const bobPayment = bob(`insert into core.payments (business_id, party_id, method, amount) values ('${bobBusiness}', '${bobCustomer}', 'cash', 100) returning id;`);
      bob(`insert into core.payment_allocations (business_id, payment_id, document_id, amount) values ('${bobBusiness}', '${bobPayment}', '${bobInvoice}', 100);`);
      const bobAccount = psql(`select account_id from core.businesses where id = '${bobBusiness}'`);
      psql(`delete from core.accounts where id = '${bobAccount}'`);
      assertEqual(psql(`select count(*) from core.payments where business_id = '${bobBusiness}'`), "0", "the business's payments go with it");
      assertEqual(psql(`select count(*) from core.payment_allocations where business_id = '${bobBusiness}'`), "0", "...and their allocations");

      console.log("\nAll SEC-7 void-only payment checks passed.");
    },
  });
}

main();
