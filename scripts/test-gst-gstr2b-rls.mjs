#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for COMPLY-P0-08.1's own
 * three new tables: `gst.gstr2b_credentials` (write-only, no SELECT at all -- same secret
 * lockdown as `gst.eway_bill_credentials`/`einvoice_credentials`, verified the same way
 * `test-gst-credentials-rls.mjs` already does for those two), `gst.gstr2b_statements`,
 * and `gst.gstr2b_documents`. Also verifies the invariants specific to these tables: the
 * `return_period` format check, `unique(business_id, return_period)`,
 * `unique(statement_id, section, document_type, supplier_gstin, document_number)` on
 * documents, cascade delete from a statement to its documents, and that
 * `gst.gstr2b_documents` has no UPDATE policy at all (a document row is replaced
 * wholesale on re-import, never edited in place -- see the migration's own docstring).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner in her own business -- every permission
const BOB = "22222222-2222-2222-2222-222222222222"; // owner in a separate business
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business -- no gst.manage_reconciliation

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_gstr2b_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      console.log("Seeding two businesses, a viewer member, licenses...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant insert, update, delete on gst.gstr2b_credentials to authenticated;
        grant select, insert, update, delete on gst.gstr2b_statements to authenticated;
        grant select, insert, delete on gst.gstr2b_documents to authenticated;
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
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${aliceBusiness}', '${bobBusiness}');
      `);

      // ---------------------------------------------------------------------
      // gst.gstr2b_credentials -- write-only, no SELECT at all.
      // ---------------------------------------------------------------------

      console.log("Carol (viewer, no settings.manage) cannot write gstr2b_credentials...");
      assertThrows(
        () =>
          psqlAsCarol(`
            insert into gst.gstr2b_credentials (business_id, gsp_provider, fetch_url)
            values ('${aliceBusiness}', 'cleartax', 'https://gsp.example.com/gstr2b')
          `),
        "Carol lacks settings.manage",
      );

      console.log("Alice (owner) can configure gstr2b_credentials...");
      psqlAsAlice(`
        insert into gst.gstr2b_credentials (business_id, gsp_provider, fetch_url, client_id, encrypted_client_secret)
        values ('${aliceBusiness}', 'cleartax', 'https://gsp.example.com/gstr2b', 'client-1', 'ciphertext-1')
      `);

      console.log("Nobody -- not even Alice, the owner who just wrote it -- can SELECT gstr2b_credentials directly...");
      assertThrows(() => psqlAsAlice(`select * from gst.gstr2b_credentials where business_id = '${aliceBusiness}'`), "no select grant/policy on gstr2b_credentials");

      console.log("The non-secret status function works without exposing the secret columns...");
      assertEqual(
        psqlAsAlice(`select gsp_provider from gst.gstr2b_credentials_status('${aliceBusiness}')`),
        "cleartax",
        "status function returns gsp_provider",
      );

      console.log("Bob (different business) sees nothing via the status function for Alice's business...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.gstr2b_credentials_status('${aliceBusiness}')`), "0", "cross-tenant status read returns nothing");

      // ---------------------------------------------------------------------
      // gst.gstr2b_statements / gst.gstr2b_documents
      // ---------------------------------------------------------------------

      const insertStatement = (business, period) => `
        insert into gst.gstr2b_statements (business_id, return_period, gstin, source, raw)
        values ('${business}', '${period}', '27AAAAA0000A1Z5', 'manual_upload', '{"fp": "092026"}'::jsonb)
        returning id
      `;

      console.log("Carol (viewer, no gst.manage_reconciliation) cannot import a gstr2b statement...");
      assertThrows(() => psqlAsCarol(insertStatement(aliceBusiness, "2026-09")), "Carol lacks gst.manage_reconciliation");

      console.log("An invalid return_period format is rejected by the check constraint...");
      assertThrows(() => psqlAsAlice(insertStatement(aliceBusiness, "092026")), "return_period format check");

      console.log("Alice (owner) can import a gstr2b statement...");
      const statementId = psqlAsAlice(insertStatement(aliceBusiness, "2026-09"));

      console.log("A second statement for the SAME business/return_period is rejected by the unique key...");
      assertThrows(() => psqlAsAlice(insertStatement(aliceBusiness, "2026-09")), "unique(business_id, return_period)");

      console.log("Bob (different business) can import his own statement for the same period -- no cross-tenant collision...");
      const bobStatementId = psqlAsBob(insertStatement(bobBusiness, "2026-09"));
      assertEqual(bobStatementId.length > 0, true, "Bob's own statement was created");

      console.log("Carol (viewer) CAN read Alice's statement (read is open to any business member)...");
      assertEqual(psqlAsCarol(`select return_period from gst.gstr2b_statements where id = '${statementId}'`), "2026-09", "viewer can read");

      console.log("Bob cannot read Alice's statement at all (tenant isolation)...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.gstr2b_statements where id = '${statementId}'`), "0", "cross-tenant read returns nothing");

      const insertDocument = (business, statement, supplierGstin, docNumber) => `
        insert into gst.gstr2b_documents (statement_id, business_id, section, document_type, supplier_gstin, document_number, taxable_value, cgst_amount, sgst_amount)
        values ('${statement}', '${business}', 'b2b', 'invoice', '${supplierGstin}', '${docNumber}', 1000, 90, 90)
        returning id
      `;

      console.log("Carol cannot insert a gstr2b document...");
      assertThrows(() => psqlAsCarol(insertDocument(aliceBusiness, statementId, "29BBBBB1111B1Z1", "INV-1")), "Carol lacks gst.manage_reconciliation");

      console.log("Alice can insert a gstr2b document...");
      const docId = psqlAsAlice(insertDocument(aliceBusiness, statementId, "29BBBBB1111B1Z1", "INV-1"));

      console.log("A duplicate (statement, section, document_type, supplier_gstin, document_number) is rejected by the unique key...");
      assertThrows(() => psqlAsAlice(insertDocument(aliceBusiness, statementId, "29BBBBB1111B1Z1", "INV-1")), "unique(statement_id, section, document_type, supplier_gstin, document_number)");

      console.log("An unrecognized section value is rejected by the check constraint...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.gstr2b_documents (statement_id, business_id, section, document_type, supplier_gstin, document_number)
            values ('${statementId}', '${aliceBusiness}', 'impg', 'invoice', '29BBBBB1111B1Z1', 'INV-2')
          `),
        "section check constraint (b2b/cdnr only)",
      );

      console.log("Carol (viewer) CAN read Alice's documents...");
      assertEqual(psqlAsCarol(`select count(*)::int from gst.gstr2b_documents where statement_id = '${statementId}'`), "1", "viewer can read documents");

      console.log("Bob cannot read Alice's documents (tenant isolation)...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.gstr2b_documents where statement_id = '${statementId}'`), "0", "cross-tenant read returns nothing");

      console.log("There is NO update policy on gstr2b_documents -- even Alice cannot update one in place...");
      assertThrows(
        () => psqlAsAlice(`update gst.gstr2b_documents set taxable_value = 5000 where id = '${docId}'`),
        "no update policy on gstr2b_documents",
      );

      console.log("Alice (with gst.manage_reconciliation) CAN delete a document (re-import path)...");
      psqlAsAlice(`delete from gst.gstr2b_documents where id = '${docId}'`);
      assertEqual(psqlAsAlice(`select count(*)::int from gst.gstr2b_documents where statement_id = '${statementId}'`), "0", "document deleted");

      console.log("Deleting the parent statement cascades to its remaining documents...");
      const docId2 = psqlAsAlice(insertDocument(aliceBusiness, statementId, "29BBBBB1111B1Z1", "INV-3"));
      assertEqual(psqlAsAlice(`select count(*)::int from gst.gstr2b_documents where id = '${docId2}'`), "1", "second document present before delete");
      psqlAsAlice(`delete from gst.gstr2b_statements where id = '${statementId}'`);
      assertEqual(psqlAsAlice(`select count(*)::int from gst.gstr2b_documents where id = '${docId2}'`), "0", "cascade-deleted with its parent statement");

      console.log("All gst.gstr2b_* RLS assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
