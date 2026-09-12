#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for
 * `gst.return_periods` (COMPLY-P0-07.5), plus the invariants that matter most for this
 * specific table: the snapshot-required-once-validated check constraint, the
 * one-period-per-(business, return_type, period) unique key, the period_end >=
 * period_start check, and no delete policy at all.
 *
 * The Draft -> Validate -> Review -> Approve -> File STATE MACHINE itself
 * (`lib/returns/lifecycle/transitions.ts`) is an application-layer rule, not a database
 * constraint -- this test does not (and structurally cannot) prove "an authorized user
 * can't skip a stage via raw SQL," since the database has no way to know what the
 * "previous" status was meant to be beyond whatever the application already wrote. That
 * gap is real and deliberately left to the application layer for this story (see this
 * story's own audit-log entry) -- COMPLY-P0-07.6 (Return Lock) is where a genuine
 * DB-level guard against altering an approved/filed period gets added.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no gst.file_returns

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_return_periods_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert, update on gst.return_periods to authenticated;
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

      const insertDraft = (business) => `
        insert into gst.return_periods (business_id, return_type, period_start, period_end, status_history)
        values ('${business}', 'gstr1', '2026-08-01', '2026-08-31', '[]'::jsonb)
        returning id
      `;

      console.log("Carol (viewer, no gst.file_returns) cannot create a return period...");
      assertThrows(
        () => psqlAsCarol(insertDraft(aliceBusiness)),
        "Carol lacks gst.file_returns",
      );

      console.log("Alice (owner) can create a draft return period...");
      const period = psqlAsAlice(insertDraft(aliceBusiness));
      assertEqual(psqlAsAlice(`select status from gst.return_periods where id = '${period}'`), "draft", "starts in draft");

      console.log("A second return period for the SAME business/return_type/period is rejected by the unique key...");
      assertThrows(() => psqlAsAlice(insertDraft(aliceBusiness)), "unique(business_id, return_type, period_start, period_end)");

      console.log("period_end before period_start is rejected...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, period_start, period_end)
            values ('${aliceBusiness}', 'gstr3b', '2026-09-30', '2026-09-01')
          `),
        "period_end >= period_start check",
      );

      console.log("An unrecognized return_type is rejected...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, period_start, period_end)
            values ('${aliceBusiness}', 'gstr2', '2026-08-01', '2026-08-31')
          `),
        "return_type check constraint",
      );

      console.log("Moving straight to 'validated' with no snapshot is rejected by the check constraint...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set status = 'validated' where id = '${period}'`),
        "return_periods_snapshot_required_once_validated",
      );

      console.log("Validating WITH a snapshot succeeds...");
      psqlAsAlice(`update gst.return_periods set status = 'validated', snapshot = '{"totals": {"taxableValue": 1000}}'::jsonb where id = '${period}'`);
      assertEqual(psqlAsAlice(`select status from gst.return_periods where id = '${period}'`), "validated", "now validated with a snapshot on file");

      console.log("Carol (viewer) can still read the period once it exists...");
      assertEqual(psqlAsCarol(`select count(*)::int from gst.return_periods where business_id = '${aliceBusiness}'`), "1", "read-only members can see the business's return periods");

      // Note on the two checks below: an UPDATE's `USING` clause makes an unauthorized
      // row invisible to the statement entirely -- Postgres matches zero rows and returns
      // successfully (no exception), it does not raise an error the way a `WITH CHECK`
      // violation on a value the writer WAS allowed to touch would. So the correct proof
      // that RLS blocked the write is "the row is unchanged after the attempt," not
      // "the attempt threw" -- `assertThrows` would be the wrong tool here (and, run for
      // real against a live Postgres, silently gives a false pass/fail either way since a
      // zero-row UPDATE never throws in the first place).
      console.log("Carol still cannot advance the period's status (no gst.file_returns) -- the update matches zero rows...");
      psqlAsCarol(`update gst.return_periods set status = 'in_review' where id = '${period}'`);
      assertEqual(psqlAsAlice(`select status from gst.return_periods where id = '${period}'`), "validated", "Carol's update was silently a no-op; the row is unchanged");

      console.log("Tenant isolation: Bob cannot see or touch Alice's return periods...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.return_periods where business_id = '${aliceBusiness}'`), "0", "Bob's RLS-scoped read of Alice's business returns nothing");
      psqlAsBob(`update gst.return_periods set status = 'in_review' where business_id = '${aliceBusiness}'`);
      assertEqual(psqlAsAlice(`select status from gst.return_periods where id = '${period}'`), "validated", "Bob's cross-tenant update was silently a no-op; the row is unchanged");

      console.log("Nobody, not even the owner, can delete a return period (no delete policy)...");
      assertThrows(() => psqlAsAlice(`delete from gst.return_periods where id = '${period}'`), "no delete policy exists on gst.return_periods");

      console.log("status_history accumulates real entries as the application layer appends them...");
      psqlAsAlice(`
        update gst.return_periods
        set status = 'in_review', status_history = status_history || jsonb_build_object('status', 'in_review', 'at', now(), 'by', '${ALICE}')
        where id = '${period}'
      `);
      assertEqual(psqlAsAlice(`select jsonb_array_length(status_history) from gst.return_periods where id = '${period}'`), "1", "one history entry recorded so far");

      // --- COMPLY-P0-07.6 (Return Lock) ---------------------------------------------
      console.log("Approving the period (in_review -> approved)...");
      psqlAsAlice(`update gst.return_periods set status = 'approved' where id = '${period}'`);
      assertEqual(psqlAsAlice(`select status from gst.return_periods where id = '${period}'`), "approved", "now approved");

      console.log("Once approved, the snapshot can never be altered, even by the owner with full permission (a real trigger exception, not an RLS no-op)...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set snapshot = '{"tampered": true}'::jsonb where id = '${period}'`),
        "gst.enforce_return_period_lock rejects altering an approved period's snapshot",
      );
      assertEqual(
        psqlAsAlice(`select snapshot ? 'tampered' from gst.return_periods where id = '${period}'`),
        "f",
        "the snapshot is genuinely unchanged after the rejected attempt",
      );

      console.log("Once approved, the period_end (part of its own defining content) can never be altered either...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set period_end = '2026-09-30' where id = '${period}'`),
        "gst.enforce_return_period_lock rejects altering an approved period's period_end",
      );

      console.log("Once approved, status can never move backward to draft/validated/in_review...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set status = 'draft' where id = '${period}'`),
        "gst.enforce_return_period_lock rejects an approved period regressing to draft",
      );

      console.log("...but approved -> filed (the one legal next step) is still allowed, snapshot untouched...");
      psqlAsAlice(`update gst.return_periods set status = 'filed' where id = '${period}'`);
      assertEqual(psqlAsAlice(`select status from gst.return_periods where id = '${period}'`), "filed", "now filed");

      console.log("Once filed, the snapshot is still permanently locked...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set snapshot = '{"tampered": true}'::jsonb where id = '${period}'`),
        "gst.enforce_return_period_lock rejects altering a filed period's snapshot",
      );

      console.log("Once filed, status can never change again -- 'filed' is the terminal stage...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set status = 'approved' where id = '${period}'`),
        "gst.enforce_return_period_lock rejects moving a filed period back to approved",
      );

      console.log("The lock fires for EVERY role, including service_role/RLS-bypassing writes -- not just ordinary authenticated writes...");
      assertThrows(
        () => psql(`update gst.return_periods set snapshot = '{"tampered": true}'::jsonb where id = '${period}'`),
        "even a superuser/service-role-equivalent write is rejected by the trigger itself",
      );

      console.log("status_history can still be appended even on a locked, filed period (only content/status are locked, not the audit trail)...");
      psqlAsAlice(`
        update gst.return_periods
        set status_history = status_history || jsonb_build_object('status', 'filed', 'at', now(), 'by', '${ALICE}')
        where id = '${period}'
      `);
      assertEqual(psqlAsAlice(`select jsonb_array_length(status_history) from gst.return_periods where id = '${period}'`), "2", "a new history entry was appended even though the period is filed and locked");

      // --- COMPLY-P0-07.7 (Filing/Payment Status) ------------------------------------
      console.log("Every filed period defaults to payment_status = 'not_applicable' (correct for GSTR-1/9, not just 'unknown')...");
      assertEqual(psqlAsAlice(`select payment_status from gst.return_periods where id = '${period}'`), "not_applicable", "default payment status");

      console.log("A filing_reference (ARN) can be attached AFTER the fact, even though the period is already filed and locked (filed_at was never set in this raw-SQL flow, so it stays null)...");
      psqlAsAlice(`update gst.return_periods set filing_reference = 'AA270826000111A' where id = '${period}'`);
      assertEqual(psqlAsAlice(`select filing_reference from gst.return_periods where id = '${period}'`), "AA270826000111A", "the ARN is now on file");

      console.log("...but once an ARN is actually on file, it can never be altered again...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set filing_reference = 'TAMPERED' where id = '${period}'`),
        "gst.enforce_return_period_lock rejects altering an already-recorded filing_reference",
      );

      console.log("A blank filing_reference is rejected on a fresh row by its own non-blank check (tested on a second, unlocked period so the lock itself isn't what's being exercised here)...");
      const secondPeriod = psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, period_start, period_end, status_history)
        values ('${aliceBusiness}', 'gstr3b', '2026-09-01', '2026-09-30', '[]'::jsonb)
        returning id
      `);
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set filing_reference = '   ' where id = '${secondPeriod}'`),
        "filing_reference non-blank check constraint",
      );

      console.log("Recording a pending payment...");
      psqlAsAlice(`update gst.return_periods set payment_status = 'pending', payment_reference = null, payment_amount = 5000.50 where id = '${period}'`);
      assertEqual(psqlAsAlice(`select payment_status from gst.return_periods where id = '${period}'`), "pending", "payment now pending");

      console.log("A negative payment_amount is rejected by its own check constraint...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set payment_amount = -1 where id = '${period}'`),
        "payment_amount >= 0 check",
      );

      console.log("Marking the payment paid, with a real CIN...");
      psqlAsAlice(`update gst.return_periods set payment_status = 'paid', payment_reference = 'CIN12345678901234', payment_date = '2026-08-20' where id = '${period}'`);
      assertEqual(psqlAsAlice(`select payment_status from gst.return_periods where id = '${period}'`), "paid", "payment now paid");

      console.log("Once paid, the payment's own status/reference/amount/date can never be altered -- a settled fact, same discipline as the return's own approved/filed content...");
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set payment_amount = 1 where id = '${period}'`),
        "gst.enforce_return_period_lock rejects altering an already-paid payment's amount",
      );
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set payment_status = 'pending' where id = '${period}'`),
        "gst.enforce_return_period_lock rejects un-paying an already-paid payment",
      );

      console.log("Carol (viewer) can read the recorded ARN and payment status, but Bob still cannot touch or see any of it (tenant isolation still holds on the new columns)...");
      assertEqual(psqlAsCarol(`select filing_reference from gst.return_periods where id = '${period}'`), "AA270826000111A", "Carol can read the ARN");
      assertEqual(psqlAsBob(`select count(*)::int from gst.return_periods where id = '${period}'`), "0", "Bob cannot see this period at all");

      // --- COMPLY-P1-02.7 (Sales Tax Returns/Remittance -- jurisdiction + us_sales_tax) ---
      console.log("A 'us_sales_tax' period MUST name a jurisdiction (the requires-jurisdiction check constraint)...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, period_start, period_end)
            values ('${aliceBusiness}', 'us_sales_tax', '2026-08-01', '2026-08-31')
          `),
        "return_periods_us_sales_tax_requires_jurisdiction rejects a null jurisdiction for us_sales_tax",
      );

      console.log("...and a NATIONAL return type (gstr1/3b/9) must NOT name one...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, jurisdiction, period_start, period_end)
            values ('${aliceBusiness}', 'gstr1', 'CA', '2026-10-01', '2026-10-31')
          `),
        "return_periods_us_sales_tax_requires_jurisdiction rejects a jurisdiction on a national return type",
      );

      console.log("A well-formed us_sales_tax period for California is accepted...");
      const caPeriod = psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, jurisdiction, period_start, period_end, status_history)
        values ('${aliceBusiness}', 'us_sales_tax', 'CA', '2026-08-01', '2026-08-31', '[]'::jsonb)
        returning id
      `);

      console.log("A malformed jurisdiction is rejected by its own format check...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, jurisdiction, period_start, period_end)
            values ('${aliceBusiness}', 'us_sales_tax', 'California', '2026-09-01', '2026-09-30')
          `),
        "jurisdiction ~ '^[A-Z]{2}$' check constraint",
      );

      console.log("A DIFFERENT state's own us_sales_tax period for the SAME business/period is a real, separate row -- the widened unique key allows it (this is the whole point of adding jurisdiction)...");
      const txPeriod = psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, jurisdiction, period_start, period_end, status_history)
        values ('${aliceBusiness}', 'us_sales_tax', 'TX', '2026-08-01', '2026-08-31', '[]'::jsonb)
        returning id
      `);
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.return_periods where business_id = '${aliceBusiness}' and return_type = 'us_sales_tax' and period_start = '2026-08-01'`),
        "2",
        "both the CA and TX periods for the same month coexist as separate rows",
      );

      console.log("...but a SECOND period for the SAME business/return_type/jurisdiction/period is still rejected by the widened unique key...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, jurisdiction, period_start, period_end)
            values ('${aliceBusiness}', 'us_sales_tax', 'CA', '2026-08-01', '2026-08-31')
          `),
        "return_periods_business_id_return_type_jurisdiction_period_key rejects a duplicate CA period",
      );

      console.log("Validating and approving the California period, then confirming jurisdiction itself is now locked too (the one new defining-identity column this story adds)...");
      psqlAsAlice(`update gst.return_periods set status = 'validated', snapshot = '{"jurisdiction": "CA"}'::jsonb where id = '${caPeriod}'`);
      psqlAsAlice(`update gst.return_periods set status = 'in_review' where id = '${caPeriod}'`);
      psqlAsAlice(`update gst.return_periods set status = 'approved' where id = '${caPeriod}'`);
      assertThrows(
        () => psqlAsAlice(`update gst.return_periods set jurisdiction = 'TX' where id = '${caPeriod}'`),
        "gst.enforce_return_period_lock rejects altering an approved period's own jurisdiction",
      );
      assertEqual(psqlAsAlice(`select jurisdiction from gst.return_periods where id = '${caPeriod}'`), "CA", "jurisdiction is genuinely unchanged after the rejected attempt");

      console.log("Tenant isolation still holds for us_sales_tax periods: Bob cannot see Alice's CA/TX periods...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.return_periods where id in ('${caPeriod}', '${txPeriod}')`), "0", "Bob sees neither");

      // --- COMPLY-P1-03.4/03.5 (Canada -- Filing Periods / CRA Filing Adapter) ----------
      console.log("A 'ca_gst_hst' period is a real, distinct, ACCEPTED return_type, with jurisdiction staying null (a national return, same shape as gstr1/3b/9)...");
      const caGstHstPeriod = psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, period_start, period_end, status_history)
        values ('${aliceBusiness}', 'ca_gst_hst', '2026-10-01', '2026-10-31', '[]'::jsonb)
        returning id
      `);
      assertEqual(psqlAsAlice(`select jurisdiction from gst.return_periods where id = '${caGstHstPeriod}'`), "", "jurisdiction is null for a national ca_gst_hst period (empty string here is just psql's own NULL rendering)");

      console.log("A SECOND ca_gst_hst period for the SAME business/period is still rejected by the widened unique key (both have jurisdiction = null, so coalesce(jurisdiction, '') collides -- confirms the earlier NULL-uniqueness fix still holds for THIS return type too)...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, period_start, period_end)
            values ('${aliceBusiness}', 'ca_gst_hst', '2026-10-01', '2026-10-31')
          `),
        "return_periods_business_id_return_type_jurisdiction_period_key rejects a duplicate ca_gst_hst period",
      );

      console.log("...but a gstr1 period for the SAME business/period is NOT a collision (different return_type, even though both also have jurisdiction = null)...");
      psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, period_start, period_end, status_history)
        values ('${aliceBusiness}', 'gstr1', '2026-10-01', '2026-10-31', '[]'::jsonb)
      `);
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.return_periods where business_id = '${aliceBusiness}' and period_start = '2026-10-01' and period_end = '2026-10-31'`),
        "2",
        "the ca_gst_hst and gstr1 periods for the identical date range coexist as separate rows",
      );

      // --- COMPLY-P1-04.2 (Singapore -- GST F5) -----------------------------------------
      console.log("An 'sg_gst_f5' period is a real, distinct, ACCEPTED return_type, with jurisdiction staying null (a national return, same shape as gstr1/3b/9/ca_gst_hst)...");
      const sgGstF5Period = psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, period_start, period_end, status_history)
        values ('${aliceBusiness}', 'sg_gst_f5', '2026-11-01', '2026-11-30', '[]'::jsonb)
        returning id
      `);
      assertEqual(psqlAsAlice(`select jurisdiction from gst.return_periods where id = '${sgGstF5Period}'`), "", "jurisdiction is null for a national sg_gst_f5 period (empty string here is just psql's own NULL rendering)");

      console.log("A SECOND sg_gst_f5 period for the SAME business/period is still rejected by the widened unique key (confirms the NULL-uniqueness fix holds for a THIRD null-jurisdiction return type)...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.return_periods (business_id, return_type, period_start, period_end)
            values ('${aliceBusiness}', 'sg_gst_f5', '2026-11-01', '2026-11-30')
          `),
        "return_periods_business_id_return_type_jurisdiction_period_key rejects a duplicate sg_gst_f5 period",
      );

      console.log("...but a ca_gst_hst period for the SAME business/period is NOT a collision (different return_type, even though both also have jurisdiction = null)...");
      psqlAsAlice(`
        insert into gst.return_periods (business_id, return_type, period_start, period_end, status_history)
        values ('${aliceBusiness}', 'ca_gst_hst', '2026-11-01', '2026-11-30', '[]'::jsonb)
      `);
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.return_periods where business_id = '${aliceBusiness}' and period_start = '2026-11-01' and period_end = '2026-11-30'`),
        "2",
        "the sg_gst_f5 and ca_gst_hst periods for the identical date range coexist as separate rows",
      );

      console.log("All gst.return_periods RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
