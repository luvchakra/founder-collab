#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.payments/payment_allocations and the
 * document_balances/document_aging views (Epic 3, story D-7; CLAUDE.md principle 9),
 * via the shared harness (C-8).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_payments_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding a business with a customer, an item and an unpaid invoice...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);
      const aliceCustomer = psqlAsAlice(`
        insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Alice Customer') returning id;
      `);
      const aliceItem = psqlAsAlice(`
        insert into core.items (business_id, name) values ('${aliceBusiness}', 'Widget') returning id;
      `);
      const aliceInvoice = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, party_id, due_date)
        values ('${aliceBusiness}', 'invoice', 'inventory', '${aliceCustomer}', current_date - 45)
        returning id;
      `);
      psqlAsAlice(`
        insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price)
        values ('${aliceBusiness}', '${aliceInvoice}', '${aliceItem}', 1, 1000);
      `);

      console.log("Verifying the unpaid invoice appears in balances/aging...");
      assertEqual(psqlAsAlice(`select balance_amount from core.document_balances where document_id = '${aliceInvoice}'`), "1000.00", "an unpaid invoice's balance equals its total_amount");
      assertEqual(psqlAsAlice(`select aging_bucket from core.document_aging where document_id = '${aliceInvoice}'`), "31-60", "45 days overdue lands in the 31-60 bucket");

      console.log("Recording a partial payment and allocating it...");
      const alicePayment = psqlAsAlice(`
        insert into core.payments (business_id, party_id, method, amount, reference)
        values ('${aliceBusiness}', '${aliceCustomer}', 'upi', 400, 'UPI-REF-1') returning id;
      `);
      psqlAsAlice(`
        insert into core.payment_allocations (business_id, payment_id, document_id, amount)
        values ('${aliceBusiness}', '${alicePayment}', '${aliceInvoice}', 400);
      `);

      console.log("Verifying the partial payment shows up in the balance view...");
      assertEqual(psqlAsAlice(`select paid_amount from core.document_balances where document_id = '${aliceInvoice}'`), "400.00", "paid_amount reflects the allocation");
      assertEqual(psqlAsAlice(`select balance_amount from core.document_balances where document_id = '${aliceInvoice}'`), "600.00", "balance_amount drops by the allocated amount");
      assertEqual(psqlAsAlice(`select balance_amount from core.document_aging where document_id = '${aliceInvoice}'`), "600.00", "the aging view reflects the same reduced balance");

      console.log("Verifying an allocation can't exceed the payment's own amount...");
      assertThrows(
        () => psqlAsAlice(`insert into core.payment_allocations (business_id, payment_id, document_id, amount) values ('${aliceBusiness}', '${alicePayment}', '${aliceInvoice}', 1)`),
        "a second allocation that would push the total past the payment's amount (400 + 1 > 400) is rejected",
      );

      console.log("Fully paying off the remaining balance...");
      const alicePayment2 = psqlAsAlice(`
        insert into core.payments (business_id, party_id, method, amount)
        values ('${aliceBusiness}', '${aliceCustomer}', 'cash', 600) returning id;
      `);
      psqlAsAlice(`
        insert into core.payment_allocations (business_id, payment_id, document_id, amount)
        values ('${aliceBusiness}', '${alicePayment2}', '${aliceInvoice}', 600);
      `);
      assertEqual(psqlAsAlice(`select balance_amount from core.document_balances where document_id = '${aliceInvoice}'`), "0.00", "the invoice is fully paid off");
      assertEqual(psqlAsAlice(`select count(*) from core.document_aging where document_id = '${aliceInvoice}'`), "0", "a fully-paid document drops out of the aging view (balance_amount > 0 filter)");

      console.log("Verifying tenant isolation (read)...");
      assertEqual(psqlAsBob("select count(*) from core.payments"), "0", "Bob sees none of Alice's payments");
      assertEqual(psqlAsBob("select count(*) from core.payment_allocations"), "0", "Bob sees none of Alice's payment allocations");
      assertEqual(psqlAsBob(`select count(*) from core.document_balances where business_id = '${aliceBusiness}'`), "0", "Bob's RLS-scoped view of document_balances excludes Alice's business");

      console.log("Verifying the cross-tenant triggers...");
      const bobCustomer = psqlAsBob(`
        insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bob Customer') returning id;
      `);
      assertThrows(
        () => psqlAsBob(`insert into core.payments (business_id, party_id, method, amount) values ('${bobBusiness}', '${aliceCustomer}', 'cash', 100)`),
        "Bob cannot record a payment against Alice's party",
      );
      const bobPayment = psqlAsBob(`
        insert into core.payments (business_id, party_id, method, amount) values ('${bobBusiness}', '${bobCustomer}', 'cash', 100) returning id;
      `);
      assertThrows(
        () => psqlAsBob(`insert into core.payment_allocations (business_id, payment_id, document_id, amount) values ('${bobBusiness}', '${bobPayment}', '${aliceInvoice}', 50)`),
        "Bob cannot allocate his own payment against Alice's invoice",
      );

      console.log("\nAll core.payments RLS checks passed.");
    },
  });
}

main();
