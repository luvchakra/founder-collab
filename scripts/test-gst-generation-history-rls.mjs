#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for `gst.einvoices`/
 * `gst.eway_bills` (S-2's generation-history tables), via the shared harness (C-8).
 * Unlike the credentials tables (test-gst-credentials-rls.mjs), these are readable --
 * an IRN/e-way-bill-number isn't a secret -- so this also proves the SELECT policy
 * itself is tenant+license scoped, not just the write side.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner in her own business -- every permission
const BOB = "22222222-2222-2222-2222-222222222222"; // owner in a separate business
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business -- no gst.generate

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_generation_history_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      console.log("Seeding two businesses, a viewer member, an invoice each, no gst license yet...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert, update on gst.einvoices, gst.eway_bills to authenticated;
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
      psql(`
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${aliceBusiness}';
        insert into core.business_members (business_id, user_id, role) values
          ('${aliceBusiness}', '${ALICE}', 'owner'),
          ('${aliceBusiness}', '${CAROL}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
      `);
      const aliceParty = psqlAsAlice(`insert into core.parties (business_id, kind, name) values ('${aliceBusiness}', 'company', 'Alice Customer') returning id;`);
      const bobParty = psqlAsBob(`insert into core.parties (business_id, kind, name) values ('${bobBusiness}', 'company', 'Bob Customer') returning id;`);
      const aliceInvoice = psqlAsAlice(`insert into core.documents (business_id, doc_type, source_module, party_id, number) values ('${aliceBusiness}', 'invoice', 'fsm', '${aliceParty}', 'INV/26-27/0001') returning id;`);
      const bobInvoice = psqlAsBob(`insert into core.documents (business_id, doc_type, source_module, party_id, number) values ('${bobBusiness}', 'invoice', 'fsm', '${bobParty}', 'INV/26-27/0002') returning id;`);

      const einvoiceInsert = (business, document) => `
        insert into gst.einvoices (business_id, document_id, irn, ack_no)
        values ('${business}', '${document}', 'IRN-TEST-1', 'ACK-TEST-1')
      `;

      console.log("Verifying no gst license at all denies both read and write...");
      assertThrows(() => psqlAsAlice(einvoiceInsert(aliceBusiness, aliceInvoice)), "with no gst license at all, Alice (owner) cannot record an e-invoice");
      assertEqual(psqlAsAlice("select count(*) from gst.einvoices"), "0", "with no gst license, Alice sees no rows (sanity, none exist yet)");

      console.log("Activating a grace-period license and re-checking (write needs active, not grace)...");
      psql(`insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at) select account_id, id, 'gst', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';`);
      assertThrows(() => psqlAsAlice(einvoiceInsert(aliceBusiness, aliceInvoice)), "a grace-period gst license still denies writes (write_licensed_business_ids() is active-only)");

      console.log("Activating the license: owner can write, viewer (no gst.generate) cannot...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'gst';`);
      assertThrows(() => psqlAsCarol(einvoiceInsert(aliceBusiness, aliceInvoice)), "Carol (viewer, no gst.generate) cannot record an e-invoice even with an active license");
      psqlAsAlice(einvoiceInsert(aliceBusiness, aliceInvoice));

      console.log("Verifying grace-period license still allows read (SELECT is a read, active-or-grace)...");
      assertEqual(psqlAsAlice("select irn from gst.einvoices"), "IRN-TEST-1", "Alice (owner) can read her own einvoice row");
      assertEqual(psqlAsCarol("select irn from gst.einvoices"), "IRN-TEST-1", "Carol (viewer, licensed-read only) can still read it -- no gst.generate needed to view");

      console.log("Verifying the one-row-per-document constraint...");
      assertThrows(() => psqlAsAlice(einvoiceInsert(aliceBusiness, aliceInvoice)), "a second e-invoice for the same document is rejected (unique(document_id))");

      console.log("Verifying the cross-tenant document_id-smuggling trigger...");
      psql(`insert into core.licenses (account_id, business_id, module_key, status) select account_id, id, 'gst', 'active' from core.businesses where id = '${bobBusiness}';`);
      assertThrows(
        () => psqlAsBob(einvoiceInsert(bobBusiness, aliceInvoice)),
        "Bob cannot record an e-invoice against Alice's document_id, even claiming his own business_id",
      );

      console.log("Verifying tenant isolation on SELECT...");
      psqlAsBob(einvoiceInsert(bobBusiness, bobInvoice));
      assertEqual(psqlAsAlice("select count(*) from gst.einvoices"), "1", "Alice sees only her own einvoice row");
      assertEqual(psqlAsBob("select count(*) from gst.einvoices"), "1", "Bob sees only his own einvoice row");

      console.log("Verifying eway_bills has the same shape (spot check: insert + cancel-via-update + isolation)...");
      psqlAsAlice(`insert into gst.eway_bills (business_id, document_id, eway_bill_number) values ('${aliceBusiness}', '${aliceInvoice}', 'EWB-TEST-1');`);
      assertEqual(psqlAsAlice(`select status from gst.eway_bills where document_id = '${aliceInvoice}'`), "generated", "a freshly generated e-way bill defaults to status 'generated'");
      psqlAsAlice(`update gst.eway_bills set status = 'cancelled', cancel_reason = 'test' where document_id = '${aliceInvoice}';`);
      assertEqual(psqlAsAlice(`select status from gst.eway_bills where document_id = '${aliceInvoice}'`), "cancelled", "an owner can cancel (update the status of) their own e-way bill");
      assertEqual(psqlAsBob("select count(*) from gst.eway_bills"), "0", "Bob sees none of Alice's e-way bills");

      console.log("Verifying nobody can delete a generation-history row (no delete policy at all)...");
      assertThrows(() => psqlAsAlice(`delete from gst.einvoices where document_id = '${aliceInvoice}'`), "an owner cannot delete an einvoice row -- append-only, no delete policy");

      console.log("All gst generation-history RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
