#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.documents/document_lines (Epic 3, story D-6;
 * CLAUDE.md principle 9), via the shared harness (C-8). Covers tenant isolation, the
 * cross-tenant party_id/item_id/document_id triggers, per-type partial indexes actually
 * being used, and the totals-recomputation trigger.
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
    dbNamePrefix: "core_documents_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants with a party and an item each...");
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
        insert into core.items (business_id, name, selling_price, hsn_code, tax_rate)
        values ('${aliceBusiness}', 'Widget', 100, '1234', 18) returning id;
      `);
      const bobCustomer = psqlAsBob(`
        insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bob Customer') returning id;
      `);
      const bobItem = psqlAsBob(`
        insert into core.items (business_id, name) values ('${bobBusiness}', 'Gadget') returning id;
      `);

      console.log("Creating a sales_order document with two lines...");
      const aliceDoc = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, party_id, shipping_amount, discount_amount)
        values ('${aliceBusiness}', 'sales_order', 'inventory', '${aliceCustomer}', 20, 10)
        returning id;
      `);
      psqlAsAlice(`
        insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price, hsn_code, tax_rate, cgst_amount, sgst_amount)
        values ('${aliceBusiness}', '${aliceDoc}', '${aliceItem}', 2, 100, '1234', 18, 9, 9);
      `);
      psqlAsAlice(`
        insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price, hsn_code, tax_rate, cgst_amount, sgst_amount)
        values ('${aliceBusiness}', '${aliceDoc}', '${aliceItem}', 1, 50, '1234', 18, 4.5, 4.5);
      `);
      psqlAsBob(`
        insert into core.documents (business_id, doc_type, source_module, party_id)
        values ('${bobBusiness}', 'purchase_order', 'inventory', '${bobCustomer}');
      `);

      console.log("Verifying tenant isolation (read)...");
      assertEqual(psqlAsAlice("select count(*) from core.documents"), "1", "Alice sees only her own document");
      assertEqual(psqlAsBob("select count(*) from core.documents"), "1", "Bob sees only his own document");
      assertEqual(psqlAsAlice("select count(*) from core.document_lines"), "2", "Alice sees only her own document's lines");
      assertEqual(psqlAsBob("select count(*) from core.document_lines"), "0", "Bob sees none of Alice's lines");

      console.log("Verifying the doc_type check constraint...");
      assertThrows(
        () => psqlAsAlice(`insert into core.documents (business_id, doc_type, source_module, party_id) values ('${aliceBusiness}', 'not_a_real_type', 'inventory', '${aliceCustomer}')`),
        "an invalid doc_type is rejected",
      );

      console.log("Verifying the cross-tenant party_id trigger on documents...");
      assertThrows(
        () => psqlAsBob(`insert into core.documents (business_id, doc_type, source_module, party_id) values ('${bobBusiness}', 'invoice', 'inventory', '${aliceCustomer}')`),
        "Bob cannot create a document against Alice's party",
      );

      console.log("Verifying the cross-tenant document_id/item_id triggers on document_lines...");
      const bobDoc = psqlAsBob(`select id from core.documents where business_id = '${bobBusiness}'`);
      assertThrows(
        () => psqlAsBob(`insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${bobBusiness}', '${aliceDoc}', '${bobItem}', 1)`),
        "Bob cannot attach a line to Alice's document",
      );
      assertThrows(
        () => psqlAsBob(`insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${bobBusiness}', '${bobDoc}', '${aliceItem}', 1)`),
        "Bob cannot attach a line referencing Alice's item",
      );

      console.log("Verifying totals recomputation...");
      // subtotal = 2*100 + 1*50 = 250; cgst = 9+4.5 = 13.5; sgst = 13.5; igst = 0
      // total = 250 - 10 (discount) + 13.5 + 13.5 + 0 + 20 (shipping) = 287
      assertEqual(psqlAsAlice(`select subtotal from core.documents where id = '${aliceDoc}'`), "250.00", "subtotal recomputed from both lines");
      assertEqual(psqlAsAlice(`select cgst_amount from core.documents where id = '${aliceDoc}'`), "13.50", "cgst_amount recomputed from both lines");
      assertEqual(psqlAsAlice(`select total_amount from core.documents where id = '${aliceDoc}'`), "287.00", "total_amount = subtotal - discount + tax + shipping");

      console.log("Verifying totals recompute again after deleting a line...");
      psqlAsAlice(`delete from core.document_lines where document_id = '${aliceDoc}' and quantity = 1`);
      assertEqual(psqlAsAlice(`select subtotal from core.documents where id = '${aliceDoc}'`), "200.00", "subtotal drops to just the remaining line after a delete");
      assertEqual(psqlAsAlice(`select total_amount from core.documents where id = '${aliceDoc}'`), "228.00", "total_amount recomputed after the delete (200 - 10 + 9 + 9 + 0 + 20)");

      console.log("Verifying totals recompute when discount_amount changes on the header...");
      psqlAsAlice(`update core.documents set discount_amount = 0 where id = '${aliceDoc}'`);
      assertEqual(psqlAsAlice(`select total_amount from core.documents where id = '${aliceDoc}'`), "238.00", "total_amount recomputed when discount_amount changes (200 - 0 + 9 + 9 + 0 + 20)");

      console.log("Verifying the tax snapshot on a line is copied at creation, not joined live...");
      const lineHsn = psqlAsAlice(`select hsn_code from core.document_lines where document_id = '${aliceDoc}'`);
      assertEqual(lineHsn, "1234", "the line's hsn_code matches the item's hsn_code at the time the line was created");
      psqlAsAlice(`update core.items set hsn_code = '9999' where id = '${aliceItem}'`);
      assertEqual(psqlAsAlice(`select hsn_code from core.document_lines where document_id = '${aliceDoc}'`), "1234", "changing the item's hsn_code afterward does not change the already-created line's snapshot");

      console.log("Verifying all eight per-type partial indexes exist...");
      const docTypes = [
        "estimate", "sales_order", "invoice", "credit_note", "debit_note",
        "proforma_invoice", "purchase_order", "sales_return",
      ];
      for (const docType of docTypes) {
        assertEqual(
          psql(`select count(*) from pg_indexes where schemaname = 'core' and indexname = 'documents_${docType}_idx'`),
          "1",
          `the partial index for doc_type='${docType}' exists`,
        );
      }

      console.log("\nAll core.documents RLS checks passed.");
    },
  });
}

main();
