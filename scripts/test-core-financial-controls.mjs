#!/usr/bin/env node
/**
 * DB test for the financial-reporting controls in
 * 20260908100000_core_financial_controls.sql: tamper-evident append-only audit log,
 * audit-log forgery fix, document posting + immutability, no deletion of numbered tax
 * documents, period close/reopen with SoD, payment void with maker-checker, and
 * access-change/license auditing.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner
const BOB = "22222222-2222-2222-2222-222222222222"; // another tenant's owner
const CAROL = "33333333-3333-3333-3333-333333333333"; // accountant
const DAVE = "44444444-4444-4444-4444-444444444444"; // accountant
const EVE = "55555555-5555-5555-5555-555555555555"; // viewer

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_financial_controls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const as = (user) => (sql) => psqlAs(user, sql);
      const alice = as(ALICE);
      const bob = as(BOB);
      const carol = as(CAROL);
      const dave = as(DAVE);
      const eve = as(EVE);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      console.log("Seeding Alice's business with an owner, two accountants and a viewer...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com'), ('${DAVE}', 'dave@example.com'),
          ('${EVE}', 'eve@example.com');
      `);
      const aliceAccount = psql(`select account_id from core.account_members where user_id = '${ALICE}'`);
      const business = psql(`insert into core.businesses (account_id, name) values ('${aliceAccount}', 'Alice Co') returning id;`);
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;
      `);
      psql(`
        insert into core.account_members (account_id, user_id, role) values
          ('${aliceAccount}', '${CAROL}', 'member'), ('${aliceAccount}', '${DAVE}', 'member'),
          ('${aliceAccount}', '${EVE}', 'member');
        insert into core.business_members (business_id, user_id, role) values
          ('${business}', '${ALICE}', 'owner'), ('${business}', '${CAROL}', 'accountant'),
          ('${business}', '${DAVE}', 'accountant'), ('${business}', '${EVE}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
      `);
      const party = alice(`insert into core.parties (business_id, name) values ('${business}', 'Customer') returning id;`);
      const item = alice(`insert into core.items (business_id, name) values ('${business}', 'Widget') returning id;`);
      const newInvoice = (number, date = "current_date") => {
        const id = alice(`
          insert into core.documents (business_id, doc_type, source_module, party_id, number, doc_date)
          values ('${business}', 'invoice', 'fsm', '${party}', ${number ? `'${number}'` : "null"}, ${date}) returning id;
        `);
        alice(`insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price) values ('${business}', '${id}', '${item}', 1, 1000);`);
        return id;
      };

      // -----------------------------------------------------------------------
      console.log("\n[1] Access-change auditing + audit.view gating...");
      assertEqual(alice(`select count(*) from core.audit_log where action = 'business_member.added'`), "4", "every business_members insert was audited");
      psql(`update core.business_members set role = 'sales_manager' where business_id = '${business}' and user_id = '${EVE}'`);
      assertEqual(alice(`select before->>'role' || '>' || (after->>'role') from core.audit_log where action = 'business_member.role_changed'`), "viewer>sales_manager", "a role change is audited with before/after");
      psql(`update core.business_members set role = 'viewer' where business_id = '${business}' and user_id = '${EVE}'`);
      assertEqual(eve("select count(*) from core.audit_log"), "0", "a viewer (no audit.view) can't read the audit log");
      assertEqual(carol(`select count(*) > 0 from core.audit_log where business_id = '${business}'`), "t", "an accountant (audit.view) can");

      // -----------------------------------------------------------------------
      console.log("\n[2] Audit-log forgery fix...");
      assertThrows(() => bob(`select core.write_audit_log('${business}', '${ALICE}', 'forged', 'x', null)`), "Bob can't write into Alice's business's audit log");
      const entry = alice(`select core.write_audit_log('${business}', '${BOB}', 'manual.note', 'x', null)`);
      assertEqual(alice(`select actor_id from core.audit_log where id = '${entry}'`), ALICE, "a user caller's actor_id is forced to themselves, not whatever they passed");
      assertThrows(() => alice(`select core.append_audit_log('${business}', null, 'x', 'x', null)`), "the internal append function isn't executable by clients");

      // -----------------------------------------------------------------------
      console.log("\n[3] Append-only + hash chain...");
      assertThrows(() => alice(`update core.audit_log set action = 'x' where id = '${entry}'`), "authenticated can't update the audit log");
      assertThrows(() => asService(`update core.audit_log set action = 'x' where id = '${entry}'`), "service_role can't update the audit log");
      assertThrows(() => asService(`delete from core.audit_log where id = '${entry}'`), "service_role can't delete from the audit log");
      assertThrows(() => psql(`delete from core.audit_log where id = '${entry}'`), "even the table owner is stopped by the append-only trigger");
      assertThrows(() => psql(`truncate core.audit_log`), "truncate is rejected");
      assertThrows(() => psql(`set core.audit_retention_purge = 'on'; delete from core.audit_log where id = '${entry}'`), "the purge flag can't delete a recent entry");
      assertEqual(alice(`select valid from core.verify_audit_chain('${business}')`), "t", "the chain verifies");
      assertThrows(() => eve(`select * from core.verify_audit_chain('${business}')`), "verification needs audit.view");

      // Simulate a DBA-level tamper (triggers off), then show it's detected.
      const victimSeq = alice(`select seq from core.audit_log where id = '${entry}'`);
      psql(`set session_replication_role = replica; update core.audit_log set action = 'tampered' where id = '${entry}';`);
      assertEqual(alice(`select valid || '|' || first_invalid_seq || '|' || reason from core.verify_audit_chain('${business}')`), `false|${victimSeq}|hash mismatch: entry was altered`, "an altered entry is detected");
      psql(`set session_replication_role = replica; update core.audit_log set action = 'manual.note' where id = '${entry}';`);
      assertEqual(alice(`select valid from core.verify_audit_chain('${business}')`), "t", "restoring the original content makes it verify again");
      // A later entry exists, so removing this one leaves a gap. (Truncating the *tail* of
      // a hash chain can't be detected from inside it -- docs/compliance/sox-financial-
      // controls.md covers anchoring the chain head externally for that case.)
      alice(`select core.write_audit_log('${business}', null, 'manual.later', 'x', null)`);
      psql(`set session_replication_role = replica; delete from core.audit_log where id = '${entry}';`);
      assertEqual(alice(`select valid || '|' || reason from core.verify_audit_chain('${business}')`), "false|sequence gap: an entry is missing", "a deleted entry is detected");

      // -----------------------------------------------------------------------
      console.log("\n[4] Posting and immutability...");
      const inv1 = newInvoice("INV/0001");
      assertThrows(() => eve(`select core.post_document('${inv1}')`), "a viewer can't post");
      const draft = newInvoice(null);
      assertThrows(() => alice(`select core.post_document('${draft}')`), "an unnumbered document can't be posted");
      carol(`select core.post_document('${inv1}')`);
      assertEqual(alice(`select posted_by from core.documents where id = '${inv1}'`), CAROL, "posted_by records who posted");
      assertThrows(() => alice(`update core.documents set discount_amount = 10 where id = '${inv1}'`), "a posted document's amounts are locked");
      assertThrows(() => alice(`update core.documents set party_id = party_id, doc_date = doc_date - 1 where id = '${inv1}'`), "a posted document's date is locked");
      assertThrows(() => alice(`insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price) values ('${business}', '${inv1}', '${item}', 1, 5)`), "lines can't be added to a posted document");
      assertThrows(() => alice(`update core.document_lines set unit_price = 1 where document_id = '${inv1}'`), "a posted document's lines can't be edited");
      assertThrows(() => alice(`delete from core.document_lines where document_id = '${inv1}'`), "a posted document's lines can't be deleted");
      alice(`update core.documents set status = 'sent', payment_status = 'unpaid', notes = 'fine' where id = '${inv1}'`);
      assertEqual(alice(`select status from core.documents where id = '${inv1}'`), "sent", "workflow fields stay editable after posting");
      assertThrows(() => alice(`update core.documents set posted_at = null where id = '${inv1}'`), "a posted document can't be unposted");
      assertThrows(() => alice(`delete from core.documents where id = '${inv1}'`), "a posted document can't be deleted");
      assertEqual(alice(`select count(*) from core.audit_log where action = 'document.posted' and entity_id = '${inv1}'`), "1", "posting is audited");

      console.log("\n[5] Numbered tax documents are never deleted...");
      const inv2 = newInvoice("INV/0002");
      assertThrows(() => alice(`delete from core.documents where id = '${inv2}'`), "a numbered (unposted) invoice can't be deleted -- GST numbering stays gap-free");
      alice(`delete from core.documents where id = '${draft}'`);
      assertEqual(alice(`select count(*) from core.documents where id = '${draft}'`), "0", "an unnumbered draft can still be deleted");

      // -----------------------------------------------------------------------
      console.log("\n[6] Payments: permission, immutability, auto-post, void + maker-checker...");
      assertThrows(() => eve(`insert into core.payments (business_id, party_id, method, amount) values ('${business}', '${party}', 'cash', 10)`), "a viewer can't record a payment");
      const pay = carol(`insert into core.payments (business_id, party_id, method, amount) values ('${business}', '${party}', 'upi', 1000) returning id;`);
      assertEqual(alice(`select count(*) from core.audit_log where action = 'payment.recorded' and entity_id = '${pay}'`), "1", "recording a payment is audited");
      carol(`insert into core.payment_allocations (business_id, payment_id, document_id, amount) values ('${business}', '${pay}', '${inv2}', 1000)`);
      assertEqual(alice(`select posted_at is not null from core.documents where id = '${inv2}'`), "t", "allocating a payment to an invoice auto-posts it");
      assertEqual(alice(`select balance_amount from core.document_balances where document_id = '${inv2}'`), "0.00", "the invoice is paid");
      assertThrows(() => alice(`update core.payments set amount = 1 where id = '${pay}'`), "a payment's amount is immutable");
      assertThrows(() => alice(`delete from core.payments where id = '${pay}'`), "payments can't be deleted");
      assertThrows(() => alice(`update core.payment_allocations set amount = 1 where payment_id = '${pay}'`), "allocations can't be edited by a member");
      assertThrows(() => psql(`update core.payment_allocations set amount = 1 where payment_id = '${pay}'`), "allocations can't be edited, even by the table owner");
      assertThrows(() => psql(`delete from core.payment_allocations where payment_id = '${pay}'`), "allocations can't be deleted, even by the table owner");
      assertThrows(() => alice(`update core.payments set voided_at = now() where id = '${pay}'`), "voided_at can't be set directly, only through void_payment()");
      alice(`update core.payments set notes = 'memo' where id = '${pay}'`);
      assertThrows(() => carol(`select core.void_payment('${pay}', 'customer chargeback')`), "maker-checker: the accountant who recorded it can't void it");
      assertThrows(() => dave(`select core.void_payment('${pay}', '')`), "a void needs a reason");
      dave(`select core.void_payment('${pay}', 'customer chargeback')`);
      assertEqual(alice(`select voided_by from core.payments where id = '${pay}'`), DAVE, "a different accountant can void it");
      assertEqual(alice(`select balance_amount from core.document_balances where document_id = '${inv2}'`), "1000.00", "a voided payment no longer counts toward the balance");
      assertThrows(() => dave(`select core.void_payment('${pay}', 'again please')`), "a payment can't be voided twice");
      assertThrows(() => alice(`insert into core.payment_allocations (business_id, payment_id, document_id, amount) values ('${business}', '${pay}', '${inv1}', 10)`), "a voided payment can't be allocated");
      assertEqual(alice(`select count(*) from core.audit_log where action = 'payment.voided'`), "1", "the void is audited");

      // -----------------------------------------------------------------------
      console.log("\n[7] Period close + reopen with segregation of duties...");
      const old = newInvoice("INV/0003", "current_date - 40");
      assertThrows(() => eve(`select core.close_books_through('${business}', current_date - 30)`), "a viewer can't close the books");
      assertThrows(() => carol(`select core.close_books_through('${business}', current_date + 1)`), "a future date can't be closed");
      carol(`select core.close_books_through('${business}', current_date - 30)`);
      assertEqual(alice(`select core.closed_through('${business}') = current_date - 30`), "t", "the close date is recorded");
      assertThrows(() => alice(`insert into core.documents (business_id, doc_type, source_module, party_id, doc_date) values ('${business}', 'estimate', 'fsm', '${party}', current_date - 31)`), "a document can't be created in a closed period");
      assertThrows(() => alice(`update core.documents set discount_amount = 5 where id = '${old}'`), "a closed-period document's amounts can't change");
      assertThrows(() => alice(`update core.document_lines set quantity = 2 where document_id = '${old}'`), "a closed-period document's lines can't change");
      alice(`update core.documents set payment_status = 'paid' where id = '${old}'`);
      assertEqual(alice(`select payment_status from core.documents where id = '${old}'`), "paid", "workflow fields on a closed-period document stay editable");
      assertThrows(() => carol(`insert into core.payments (business_id, party_id, method, amount, payment_date) values ('${business}', '${party}', 'cash', 5, current_date - 31)`), "a payment can't be backdated into a closed period");
      assertThrows(() => carol(`select core.reopen_books('${business}', current_date - 60, 'need to fix an invoice')`), "SoD: an accountant can close but not reopen");
      assertThrows(() => alice(`select core.reopen_books('${business}', current_date - 60, 'short')`), "reopening needs a real reason");
      alice(`select core.reopen_books('${business}', current_date - 60, 'Correcting a mis-dated invoice per review')`);
      alice(`update core.documents set discount_amount = 5 where id = '${old}'`);
      assertEqual(alice(`select discount_amount from core.documents where id = '${old}'`), "5.00", "after reopening, the document is editable again");
      assertEqual(alice(`select count(*) from core.audit_log where action in ('finance.books_closed', 'finance.books_reopened')`), "2", "close and reopen are both audited");
      assertEqual(alice(`select after->>'reason' from core.audit_log where action = 'finance.books_reopened'`), "Correcting a mis-dated invoice per review", "the reopen reason is in the audit trail");
      assertThrows(() => alice(`update core.financial_close set closed_through = current_date - 365 where business_id = '${business}'`), "the close date can't be edited directly");

      // -----------------------------------------------------------------------
      console.log("\n[8] License changes are audited; tenant isolation holds...");
      asService(`insert into core.licenses (account_id, business_id, module_key, status) values ('${aliceAccount}', '${business}', 'fsm', 'active')`);
      asService(`update core.licenses set status = 'grace' where business_id = '${business}' and module_key = 'fsm'`);
      assertEqual(alice(`select count(*) from core.audit_log where action = 'license.status_changed'`), "2", "license activation and status change are audited");
      assertEqual(bob(`select count(*) from core.audit_log where business_id = '${business}'`), "0", "Bob sees none of Alice's audit log");
      assertThrows(() => bob(`select core.void_payment('${pay}', 'cross tenant')`), "Bob can't void Alice's payment");
      assertThrows(() => bob(`select core.close_books_through('${business}', current_date - 1)`), "Bob can't close Alice's books");

      console.log("\n[9] Business deletion leaves evidence...");
      psql(`delete from core.businesses where id = '${bobBusiness}'`);
      assertEqual(psql(`select count(*) from core.audit_log where business_id = '${bobBusiness}' and action = 'business.deleted'`), "1", "the deleted business's audit trail (incl. the deletion itself) survives");

      console.log("\nAll financial-control checks passed.");
    },
  });
}

main();
