#!/usr/bin/env node
/**
 * COMPLY-P0-10.3 (Audit Trail): verifies the four new `gst.*` triggers actually write a
 * real `core.audit_log` row on the state change each is meant to catch -- a DB trigger
 * can only be verified against a real Postgres instance, never a vitest unit test.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_audit_trail_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);

      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert, update on gst.return_periods, gst.reconciliation_exceptions, gst.tax_registrations to authenticated;
        grant select, insert, update, delete on gst.gstr2b_statements to authenticated;
        grant select, insert, delete on gst.gstr2b_documents to authenticated;
        grant select, insert, update on gst.ims_actions to authenticated;
      `);
      const aliceBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role) values ('${aliceBusiness}', '${ALICE}', 'owner');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id = '${aliceBusiness}';
      `);

      console.log("gst.return_periods: a status change writes an audit entry...");
      const periodId = psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, period_start, period_end)
        values ('${aliceBusiness}', 'gstr3b', '2026-08-01', '2026-08-31')
        returning id;
      `);
      psqlAsAlice(`update gst.return_periods set status = 'validated', snapshot = '{}'::jsonb where id = '${periodId}';`);
      assertEqual(
        psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}' and action = 'return_period.status_changed' and entity_id = '${periodId}'`),
        "1",
        "one audit entry for the return_period status change",
      );

      console.log("gst.return_periods: a payment_status change writes its OWN, separate audit entry...");
      psqlAsAlice(`update gst.return_periods set payment_status = 'pending' where id = '${periodId}';`);
      assertEqual(
        psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}' and action = 'return_period.payment_status_changed' and entity_id = '${periodId}'`),
        "1",
        "one audit entry for the return_period payment_status change",
      );

      console.log("An update that changes NEITHER status nor payment_status writes NO audit entry...");
      const beforeCount = psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}'`);
      psqlAsAlice(`update gst.return_periods set updated_at = now() where id = '${periodId}';`);
      assertEqual(psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}'`), beforeCount, "no new audit entry for a no-op field change");

      console.log("gst.ims_actions: recording an action (insert) writes an audit entry...");
      const statementId = psqlAsAlice(`
        insert into gst.gstr2b_statements (business_id, return_period, source, raw)
        values ('${aliceBusiness}', '2026-08', 'manual_upload', '{}'::jsonb)
        returning id;
      `);
      const documentId = psqlAsAlice(`
        insert into gst.gstr2b_documents (statement_id, business_id, section, document_type, supplier_gstin, document_number, taxable_value, cgst_amount, sgst_amount)
        values ('${statementId}', '${aliceBusiness}', 'b2b', 'invoice', '29BBBBB1111B1Z1', 'INV-1', 1000, 90, 90)
        returning id;
      `);
      const imsActionId = psqlAsAlice(`
        insert into gst.ims_actions (business_id, gstr2b_document_id, action)
        values ('${aliceBusiness}', '${documentId}', 'pending')
        returning id;
      `);
      assertEqual(
        psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}' and action = 'ims_action.recorded' and entity_id = '${imsActionId}'`),
        "1",
        "one audit entry for the initial IMS action",
      );

      console.log("gst.ims_actions: changing one's mind (update) writes a SECOND, distinct audit entry...");
      psqlAsAlice(`update gst.ims_actions set action = 'accepted' where id = '${imsActionId}';`);
      assertEqual(
        psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}' and action = 'ims_action.recorded' and entity_id = '${imsActionId}'`),
        "2",
        "two audit entries total for this IMS action row (initial + changed mind)",
      );

      console.log("gst.reconciliation_exceptions: resolving one writes an audit entry...");
      const exceptionId = psqlAsAlice(`
        insert into gst.reconciliation_exceptions (business_id, return_period, exception_type, reference_key, summary)
        values ('${aliceBusiness}', '2026-08', 'missing_in_2b', '29AAAAA0000A1Z1', 'Test exception')
        returning id;
      `);
      psqlAsAlice(`update gst.reconciliation_exceptions set status = 'resolved', resolution_note = 'fixed' where id = '${exceptionId}';`);
      assertEqual(
        psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}' and action = 'reconciliation_exception.status_changed' and entity_id = '${exceptionId}'`),
        "1",
        "one audit entry for the reconciliation exception status change",
      );

      console.log("gst.tax_registrations: cancelling one writes an audit entry...");
      const registrationId = psqlAsAlice(`
        insert into gst.tax_registrations (business_id, country, regime, registration_number)
        values ('${aliceBusiness}', 'IN', 'GST', '29AAAAA0000A1Z5')
        returning id;
      `);
      psqlAsAlice(`update gst.tax_registrations set registration_status = 'cancelled' where id = '${registrationId}';`);
      assertEqual(
        psqlAsAlice(`select count(*)::int from core.audit_log where business_id = '${aliceBusiness}' and action = 'tax_registration.status_changed' and entity_id = '${registrationId}'`),
        "1",
        "one audit entry for the tax registration status change",
      );

      console.log("All gst audit-trail trigger assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
