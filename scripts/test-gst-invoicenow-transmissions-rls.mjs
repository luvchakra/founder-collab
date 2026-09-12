#!/usr/bin/env node
/**
 * COMPLY-P1-04.5/04.6 (Singapore -- InvoiceNow Adapter, Transmission Status):
 * tenant-isolation + license-gating + permission-gating test for
 * `gst.invoicenow_transmissions`, via the shared harness (C-8) -- same shape
 * `test-gst-generation-history-rls.mjs` already established for `gst.einvoices`/
 * `gst.eway_bills` (this table reuses the SAME `gst.generate` permission and the same
 * cross-tenant document_id-smuggling trigger pattern), plus this table's own extra
 * `status` values (`'rejected'`/`'failed'`, not just `'generated'`/`'cancelled'`).
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
    dbNamePrefix: "gst_invoicenow_transmissions_rls_test",
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
        grant select, insert, update on gst.invoicenow_transmissions to authenticated;
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

      const transmissionInsert = (business, document) => `
        insert into gst.invoicenow_transmissions (business_id, document_id, status, peppol_message_id, buyer_peppol_id)
        values ('${business}', '${document}', 'sent', 'MSG-TEST-1', '0195:sguen201132058e')
      `;

      console.log("Verifying no gst license at all denies both read and write...");
      assertThrows(() => psqlAsAlice(transmissionInsert(aliceBusiness, aliceInvoice)), "with no gst license at all, Alice (owner) cannot record an InvoiceNow transmission");
      assertEqual(psqlAsAlice("select count(*) from gst.invoicenow_transmissions"), "0", "with no gst license, Alice sees no rows (sanity, none exist yet)");

      console.log("Activating a grace-period license and re-checking (write needs active, not grace)...");
      psql(`insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at) select account_id, id, 'gst', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';`);
      assertThrows(() => psqlAsAlice(transmissionInsert(aliceBusiness, aliceInvoice)), "a grace-period gst license still denies writes (write_licensed_business_ids() is active-only)");

      console.log("Activating the license: owner can write, viewer (no gst.generate) cannot...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'gst';`);
      assertThrows(() => psqlAsCarol(transmissionInsert(aliceBusiness, aliceInvoice)), "Carol (viewer, no gst.generate) cannot record an InvoiceNow transmission even with an active license");
      psqlAsAlice(transmissionInsert(aliceBusiness, aliceInvoice));

      console.log("Verifying grace-period license still allows read (SELECT is a read, active-or-grace)...");
      assertEqual(psqlAsAlice("select peppol_message_id from gst.invoicenow_transmissions"), "MSG-TEST-1", "Alice (owner) can read her own transmission row");
      assertEqual(psqlAsCarol("select peppol_message_id from gst.invoicenow_transmissions"), "MSG-TEST-1", "Carol (viewer, licensed-read only) can still read it -- no gst.generate needed to view");

      console.log("Verifying the one-row-per-document constraint...");
      assertThrows(() => psqlAsAlice(transmissionInsert(aliceBusiness, aliceInvoice)), "a second transmission for the same document is rejected (unique(document_id))");

      console.log("Verifying the cross-tenant document_id-smuggling trigger...");
      psql(`insert into core.licenses (account_id, business_id, module_key, status) select account_id, id, 'gst', 'active' from core.businesses where id = '${bobBusiness}';`);
      assertThrows(
        () => psqlAsBob(transmissionInsert(bobBusiness, aliceInvoice)),
        "Bob cannot record a transmission against Alice's document_id, even claiming his own business_id",
      );

      console.log("Verifying tenant isolation on SELECT...");
      psqlAsBob(transmissionInsert(bobBusiness, bobInvoice));
      assertEqual(psqlAsAlice("select count(*) from gst.invoicenow_transmissions"), "1", "Alice sees only her own transmission row");
      assertEqual(psqlAsBob("select count(*) from gst.invoicenow_transmissions"), "1", "Bob sees only his own transmission row");

      console.log("Verifying an owner can update status (e.g. sent -> delivered/rejected) on their own row...");
      psqlAsAlice(`update gst.invoicenow_transmissions set status = 'delivered' where document_id = '${aliceInvoice}';`);
      assertEqual(psqlAsAlice(`select status from gst.invoicenow_transmissions where document_id = '${aliceInvoice}'`), "delivered", "an owner can update the status of their own transmission");
      assertThrows(
        () => psqlAsAlice(`update gst.invoicenow_transmissions set status = 'not_a_real_status' where document_id = '${aliceInvoice}'`),
        "an invalid status value is rejected by the table's own check constraint",
      );

      console.log("Verifying nobody can delete a transmission row (no delete policy at all)...");
      assertThrows(() => psqlAsAlice(`delete from gst.invoicenow_transmissions where document_id = '${aliceInvoice}'`), "an owner cannot delete a transmission row -- append-only, no delete policy");

      console.log("All gst.invoicenow_transmissions RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
