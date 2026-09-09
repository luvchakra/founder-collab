#!/usr/bin/env node
/**
 * Workflow test for `fsm`'s opportunity -> job -> invoice pipeline (F-2/F-5/F-8) and
 * its permission model (F-2/F-3/F-5's own `opportunities.edit`/`estimates.edit`/
 * `jobs.edit`/`jobs.reopen` permission keys).
 *
 * Scope, honestly stated: this harness runs raw SQL directly against Postgres, the
 * same way every other `test-*-rls.mjs`/`test-*-workflow.mjs` script in this repo does
 * -- it can verify database-level facts (RLS, check constraints, FK-smuggling
 * triggers, and `core.has_permission()`'s own role_permissions data), but FSM's actual
 * status-transition guards (job.ts's `transition()` helper, e.g. "can't start a job
 * that isn't scheduled") and its new permission ENFORCEMENT (the `requirePermission()`
 * calls this same pass added to opportunities/estimates/jobs mutations.ts) both live in
 * TypeScript, not a DB trigger or check constraint -- unlike e.g. inventory's
 * sales_returns, which enforces its own status machine and permission checks with a
 * real Postgres trigger (test-sales-returns-workflow.mjs's own coverage). There is
 * nothing at the SQL level stopping an arbitrary status jump or an unpermitted write;
 * that's a real, structural gap in what this repo's DB-level testing convention alone
 * can prove for FSM, not something this script can paper over. What IS verified below:
 * - core.role_permissions has exactly the rows the F-2/F-3/F-5 migrations declared, so
 *   owner/admin get all four fsm permission keys and viewer gets none of them -- if
 *   requirePermission()'s app-layer check is ever wired up to the wrong key, or a
 *   future migration accidentally drops a role_permissions row, this catches it.
 * - The opportunity -> job -> invoice document chain links correctly and stays
 *   tenant-isolated.
 * A real close of the transition/permission-enforcement gap needs a TypeScript-level
 * test that actually calls createOpportunity()/reopenJob()/etc. as different roles --
 * this repo has no such harness yet (see docs/testing/TESTING_STRATEGY.md); that's the
 * next thing to build, not attempted here.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, same business as Alice
const BOB = "44444444-4444-4444-4444-444444444444"; // owner of a separate business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "fsm_workflow_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asCarol = (sql) => psqlAs(CAROL, sql);
      const asBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two licensed businesses, an owner + a viewer on one of them...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${CAROL}', 'carol@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema fsm to authenticated;
        grant select, insert, update, delete on all tables in schema fsm to authenticated;
      `);
      const business = psql(`
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
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${business}';
        insert into core.business_members (business_id, user_id, role) values
          ('${business}', '${ALICE}', 'owner'),
          ('${business}', '${CAROL}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, '${business}', 'fsm', 'active' from core.businesses where id = '${business}';
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, '${bobBusiness}', 'fsm', 'active' from core.businesses where id = '${bobBusiness}';
      `);

      // ---------------------------------------------------------------------
      // 1. core.has_permission() data correctness for the four fsm permission keys
      // this pass wired requirePermission() up to.
      // ---------------------------------------------------------------------
      console.log("Verifying core.has_permission() for the fsm permission keys, per role...");
      for (const key of ["opportunities.edit", "estimates.edit", "jobs.edit", "jobs.reopen"]) {
        assertEqual(asAlice(`select core.has_permission('${business}', '${key}')`), "t", `owner has '${key}'`);
        assertEqual(asCarol(`select core.has_permission('${business}', '${key}')`), "f", `viewer lacks '${key}'`);
      }

      // ---------------------------------------------------------------------
      // 2. Opportunity -> job -> invoice document chain, tenant-isolated.
      // ---------------------------------------------------------------------
      console.log("Building the opportunity -> job -> invoice chain...");
      const party = asAlice(`insert into core.parties (business_id, name) values ('${business}', 'Acme Corp') returning id;`);
      const opportunity = asAlice(`
        insert into fsm.opportunities (business_id, party_id, description)
        values ('${business}', '${party}', 'HVAC repair inquiry')
        returning id;
      `);
      assertEqual(asAlice(`select status from fsm.opportunities where id = '${opportunity}'`), "new", "a new opportunity defaults to status 'new'");

      const job = asAlice(`
        insert into fsm.jobs (business_id, party_id, opportunity_id)
        values ('${business}', '${party}', '${opportunity}')
        returning id;
      `);
      asAlice(`update fsm.opportunities set status = 'won', converted_job_id = '${job}' where id = '${opportunity}';`);
      assertEqual(asAlice(`select opportunity_id from fsm.jobs where id = '${job}'`), opportunity, "the job links back to the opportunity that produced it");
      assertEqual(asAlice(`select converted_job_id from fsm.opportunities where id = '${opportunity}'`), job, "the opportunity links forward to the job it became");

      asAlice(`update fsm.jobs set status = 'completed', completed_at = now() where id = '${job}';`);
      const invoice = asAlice(`
        insert into core.documents (business_id, doc_type, source_module, source_ref, party_id, status)
        values ('${business}', 'invoice', 'fsm', jsonb_build_object('job_id', '${job}'), '${party}', 'draft')
        returning id;
      `);
      assertEqual(
        asAlice(`select source_ref->>'job_id' from core.documents where id = '${invoice}'`),
        job,
        "the generated invoice's source_ref points back at the completed job",
      );

      // ---------------------------------------------------------------------
      // 3. Tenant isolation across the whole chain -- Bob (a different business)
      // sees none of it, and can't smuggle a reference into his own records either.
      // ---------------------------------------------------------------------
      console.log("Verifying tenant isolation across the opportunity/job/invoice chain...");
      assertEqual(asBob(`select count(*) from fsm.opportunities where id = '${opportunity}'`), "0", "Bob cannot see Alice's opportunity");
      assertEqual(asBob(`select count(*) from fsm.jobs where id = '${job}'`), "0", "Bob cannot see Alice's job");
      assertEqual(asBob(`select count(*) from core.documents where id = '${invoice}'`), "0", "Bob cannot see Alice's invoice");
      assertThrows(
        () => asBob(`insert into fsm.jobs (business_id, party_id, opportunity_id) values ('${bobBusiness}', '${party}', '${opportunity}')`),
        "Bob cannot wire a job in his own business to Alice's party (cross-tenant reference-smuggling trigger)",
      );

      console.log("\nAll fsm workflow checks passed.");
    },
  });
}

main();
