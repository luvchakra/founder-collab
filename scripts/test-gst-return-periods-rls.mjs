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

      console.log("All gst.return_periods RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
