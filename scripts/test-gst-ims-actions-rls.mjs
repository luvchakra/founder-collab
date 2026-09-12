#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for `gst.ims_actions`
 * (COMPLY-P0-08.4), plus the invariant that matters most here: the
 * `gst.enforce_gstr2b_document_business_id` cross-reference guard actually rejects a row
 * whose `gstr2b_document_id` belongs to a DIFFERENT business than its own `business_id`
 * -- RLS alone cannot catch that, only the trigger can, so this is exercised as a real
 * database call, not reasoned about on paper.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no gst.manage_reconciliation

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_ims_actions_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      console.log("Seeding two businesses, a viewer member, licenses, a gstr2b statement + document for each...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert, update, delete on gst.gstr2b_statements to authenticated;
        grant select, insert, delete on gst.gstr2b_documents to authenticated;
        grant select, insert, update on gst.ims_actions to authenticated;
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

      const aliceStatementId = psqlAsAlice(`
        insert into gst.gstr2b_statements (business_id, return_period, source, raw)
        values ('${aliceBusiness}', '2026-09', 'manual_upload', '{}'::jsonb)
        returning id
      `);
      const aliceDocId = psqlAsAlice(`
        insert into gst.gstr2b_documents (statement_id, business_id, section, document_type, supplier_gstin, document_number, taxable_value, cgst_amount, sgst_amount)
        values ('${aliceStatementId}', '${aliceBusiness}', 'b2b', 'invoice', '29BBBBB1111B1Z1', 'INV-1', 1000, 90, 90)
        returning id
      `);
      const bobStatementId = psqlAsBob(`
        insert into gst.gstr2b_statements (business_id, return_period, source, raw)
        values ('${bobBusiness}', '2026-09', 'manual_upload', '{}'::jsonb)
        returning id
      `);
      const bobDocId = psqlAsBob(`
        insert into gst.gstr2b_documents (statement_id, business_id, section, document_type, supplier_gstin, document_number, taxable_value, cgst_amount, sgst_amount)
        values ('${bobStatementId}', '${bobBusiness}', 'b2b', 'invoice', '29CCCCC2222C1Z1', 'INV-9', 500, 45, 45)
        returning id
      `);

      const insertAction = (business, docId, action) => `
        insert into gst.ims_actions (business_id, gstr2b_document_id, action, action_history)
        values ('${business}', '${docId}', '${action}', '[]'::jsonb)
        returning id
      `;

      console.log("Carol (viewer, no gst.manage_reconciliation) cannot record an IMS action...");
      assertThrows(() => psqlAsCarol(insertAction(aliceBusiness, aliceDocId, "accepted")), "Carol lacks gst.manage_reconciliation");

      console.log("Alice (owner) can accept her own document...");
      const actionId = psqlAsAlice(insertAction(aliceBusiness, aliceDocId, "accepted"));
      assertEqual(psqlAsAlice(`select action from gst.ims_actions where id = '${actionId}'`), "accepted", "recorded as accepted");

      console.log("An unrecognized action value is rejected by the check constraint...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.ims_actions (business_id, gstr2b_document_id, action)
            values ('${aliceBusiness}', '${aliceDocId}', 'ignored')
          `),
        "action check constraint (accepted/rejected/pending only)",
      );

      console.log("A second row for the SAME gstr2b_document_id is rejected by unique(gstr2b_document_id)...");
      assertThrows(() => psqlAsAlice(insertAction(aliceBusiness, aliceDocId, "rejected")), "unique(gstr2b_document_id)");

      console.log("CROSS-REFERENCE GUARD: Alice cannot insert an ims_actions row for HER OWN business_id but pointing at BOB's document -- the trigger, not RLS, must catch this...");
      assertThrows(
        () => psqlAsAlice(insertAction(aliceBusiness, bobDocId, "accepted")),
        "gst.enforce_gstr2b_document_business_id rejects a cross-tenant document reference even when business_id itself is the caller's own",
      );

      console.log("Bob can accept his own document (proving the guard isn't just blocking everything)...");
      const bobActionId = psqlAsBob(insertAction(bobBusiness, bobDocId, "accepted"));
      assertEqual(psqlAsBob(`select action from gst.ims_actions where id = '${bobActionId}'`), "accepted", "Bob's own action recorded");

      console.log("Alice can update her own action to rejected...");
      psqlAsAlice(`update gst.ims_actions set action = 'rejected', action_history = '[]'::jsonb where id = '${actionId}'`);
      assertEqual(psqlAsAlice(`select action from gst.ims_actions where id = '${actionId}'`), "rejected", "changed to rejected");

      console.log("Carol (viewer) CAN read Alice's IMS action (read is open to any business member)...");
      assertEqual(psqlAsCarol(`select count(*)::int from gst.ims_actions where id = '${actionId}'`), "1", "viewer can read");

      console.log("Bob cannot read Alice's IMS action at all (tenant isolation)...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.ims_actions where id = '${actionId}'`), "0", "cross-tenant read returns nothing");

      console.log("There is NO delete policy on ims_actions -- even Alice cannot delete her own action...");
      assertThrows(() => psqlAsAlice(`delete from gst.ims_actions where id = '${actionId}'`), "no delete policy on ims_actions");

      console.log("All gst.ims_actions RLS assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
