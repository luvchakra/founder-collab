#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for
 * `gst.finance_exceptions` (FIN-1), plus its own specific invariants: the
 * `exception_type` and `status` check constraints, `unique(business_id, exception_type,
 * reference_key)` (the natural key sync relies on to stay additive-only), and no delete
 * policy.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no gst.exceptions.manage

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_finance_exceptions_rls_test",
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
        grant select, insert, update on gst.finance_exceptions to authenticated;
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

      const insertException = (business, type, key, summary) => `
        insert into gst.finance_exceptions (business_id, exception_type, reference_key, summary, impact)
        values ('${business}', '${type}', '${key}', '${summary}', 'It matters')
        returning id
      `;

      console.log("Carol (viewer, no gst.exceptions.manage) cannot create an exception...");
      assertThrows(() => psqlAsCarol(insertException(aliceBusiness, "unposted_document", "doc-1", "test")), "Carol lacks gst.exceptions.manage");

      console.log("Alice (owner) can create an exception...");
      const exceptionId = psqlAsAlice(insertException(aliceBusiness, "unposted_document", "doc-1", "Invoice unposted"));
      assertEqual(psqlAsAlice(`select status from gst.finance_exceptions where id = '${exceptionId}'`), "open", "starts open");

      console.log("An unrecognized exception_type is rejected by the check constraint...");
      assertThrows(() => psqlAsAlice(insertException(aliceBusiness, "bogus_type", "doc-2", "test")), "exception_type check constraint");

      console.log("FIN-2's own 'unposted_payment' exception_type is accepted (the widened constraint)...");
      const paymentExceptionId = psqlAsAlice(insertException(aliceBusiness, "unposted_payment", "alloc-1", "Payment unposted"));
      assertEqual(paymentExceptionId.length > 0, true, "unposted_payment row created");

      console.log("An unrecognized status is rejected by the check constraint...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.finance_exceptions (business_id, exception_type, reference_key, summary, impact, status)
            values ('${aliceBusiness}', 'itc_at_risk', '2026-09', 'test', 'test', 'dismissed')
          `),
        "status check constraint",
      );

      console.log("A duplicate (business, exception_type, reference_key) is rejected by the unique key...");
      assertThrows(() => psqlAsAlice(insertException(aliceBusiness, "unposted_document", "doc-1", "Duplicate")), "unique(business_id, exception_type, reference_key)");

      console.log("The SAME reference_key with a DIFFERENT exception_type is allowed (different natural key)...");
      const secondId = psqlAsAlice(insertException(aliceBusiness, "filing_blocker", "doc-1", "Different type, same key"));
      assertEqual(secondId.length > 0, true, "second row created");

      console.log("Alice can move her own exception through the working states...");
      psqlAsAlice(`update gst.finance_exceptions set status = 'in_review', status_history = '[{"status":"in_review"}]'::jsonb where id = '${exceptionId}'`);
      assertEqual(psqlAsAlice(`select status from gst.finance_exceptions where id = '${exceptionId}'`), "in_review", "now in review");
      psqlAsAlice(`update gst.finance_exceptions set status = 'resolved', resolution_note = 'Fixed', resolved_by = '${ALICE}' where id = '${exceptionId}'`);
      assertEqual(psqlAsAlice(`select status from gst.finance_exceptions where id = '${exceptionId}'`), "resolved", "now resolved");

      console.log("Alice can assign an owner independent of status...");
      psqlAsAlice(`update gst.finance_exceptions set owner_id = '${ALICE}' where id = '${secondId}'`);
      assertEqual(psqlAsAlice(`select owner_id from gst.finance_exceptions where id = '${secondId}'`), ALICE, "owner assigned");

      console.log("Carol (viewer) CAN read Alice's exceptions (read is open to any business member)...");
      assertEqual(psqlAsCarol(`select count(*)::int from gst.finance_exceptions where business_id = '${aliceBusiness}'`), "3", "viewer can read all three");

      console.log("Bob cannot read Alice's exceptions at all (tenant isolation)...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.finance_exceptions where business_id = '${aliceBusiness}'`), "0", "cross-tenant read returns nothing");

      console.log("Bob can create his own exception for his own business (no cross-tenant collision on reference_key)...");
      const bobId = psqlAsBob(insertException(bobBusiness, "unposted_document", "doc-1", "Bob own document"));
      assertEqual(bobId.length > 0, true, "Bob's own exception created");

      console.log("There is NO delete policy on finance_exceptions -- even Alice cannot delete her own exception...");
      assertThrows(() => psqlAsAlice(`delete from gst.finance_exceptions where id = '${exceptionId}'`), "no delete policy on finance_exceptions");

      console.log("All gst.finance_exceptions RLS assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
