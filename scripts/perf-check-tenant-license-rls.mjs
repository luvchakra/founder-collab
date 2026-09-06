#!/usr/bin/env node
/**
 * Epic 2, story C-9: performance check for the `tenant AND licensed` RLS pattern
 * (CLAUDE.md non-negotiable #2) that every future licensed-module table (inventory,
 * fsm, crm, gst) will use. No such table exists yet (SP-3a is still ahead), so this
 * seeds two synthetic tables shaped like a real module table -- one with a plain
 * tenant policy, one with `tenant AND core.has_module()` -- at ~100k rows each under
 * the same business, and compares EXPLAIN ANALYZE execution time and plan shape.
 *
 * Passes if the licensed-table scan is not asymptotically worse than the tenant-only
 * scan and stays within a small constant-factor slowdown.
 *
 * First run of this script (calling the scalar core.has_module(business_id, key) once
 * per row, since business_id is a correlated column reference the planner can't hoist)
 * measured a genuine 22x regression at 100k rows -- exactly the case C-9 exists to catch.
 * Fixed by adding core.licensed_business_ids(key) (migration 20260906098000), an
 * uncorrelated set-returning function usable as `business_id in (select
 * core.licensed_business_ids('inventory'))`, evaluated once and hashed the same way
 * core.user_business_ids() already is. This script now exercises that fixed pattern;
 * see the migration's own comment for the before/after numbers.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");
const ALICE = "11111111-1111-1111-1111-111111111111";
const ROW_COUNT = 100_000;

function executionTimeMs(explainOutput) {
  const match = explainOutput.match(/Execution Time:\s*([\d.]+)\s*ms/);
  if (!match) throw new Error(`Could not parse execution time from:\n${explainOutput}`);
  return Number(match[1]);
}

async function main() {
  await withTestDatabase({
    dbNamePrefix: "perf_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);

      console.log("Seeding one licensed business...");
      psql(`insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com');`);
      const business = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'inventory', 'active' from core.businesses where id = '${business}';
      `);

      console.log("Creating synthetic tenant-only and tenant+licensed tables...");
      psql(`
        create schema perf_test;

        create table perf_test.tenant_only (
          id uuid primary key default gen_random_uuid(),
          business_id uuid not null references core.businesses (id),
          name text not null
        );
        create index on perf_test.tenant_only (business_id);
        alter table perf_test.tenant_only enable row level security;
        create policy "tenant only" on perf_test.tenant_only for select
          using (business_id in (select core.user_business_ids()));

        create table perf_test.tenant_licensed (
          id uuid primary key default gen_random_uuid(),
          business_id uuid not null references core.businesses (id),
          name text not null
        );
        create index on perf_test.tenant_licensed (business_id);
        alter table perf_test.tenant_licensed enable row level security;
        create policy "tenant and licensed" on perf_test.tenant_licensed for select
          using (
            business_id in (select core.user_business_ids())
            and business_id in (select core.licensed_business_ids('inventory'))
          );

        grant usage on schema perf_test to authenticated;
        grant select on perf_test.tenant_only, perf_test.tenant_licensed to authenticated;

        insert into perf_test.tenant_only (business_id, name)
        select '${business}', 'row ' || g
        from generate_series(1, ${ROW_COUNT}) g;

        insert into perf_test.tenant_licensed (business_id, name)
        select '${business}', 'row ' || g
        from generate_series(1, ${ROW_COUNT}) g;

        analyze perf_test.tenant_only;
        analyze perf_test.tenant_licensed;
      `);

      console.log(`Running EXPLAIN ANALYZE over ${ROW_COUNT.toLocaleString()} rows each...`);
      const tenantOnlyPlan = psqlAsAlice(
        "explain (analyze, buffers) select count(*) from perf_test.tenant_only",
      );
      const tenantLicensedPlan = psqlAsAlice(
        "explain (analyze, buffers) select count(*) from perf_test.tenant_licensed",
      );

      console.log("\n--- tenant-only plan ---");
      console.log(tenantOnlyPlan);
      console.log("\n--- tenant AND licensed plan ---");
      console.log(tenantLicensedPlan);

      const tenantOnlyMs = executionTimeMs(tenantOnlyPlan);
      const tenantLicensedMs = executionTimeMs(tenantLicensedPlan);
      const ratio = tenantLicensedMs / tenantOnlyMs;

      console.log(`\ntenant-only:       ${tenantOnlyMs.toFixed(2)} ms`);
      console.log(`tenant+licensed:   ${tenantLicensedMs.toFixed(2)} ms`);
      console.log(`ratio:             ${ratio.toFixed(2)}x`);

      if (tenantLicensedPlan.includes("Seq Scan") && !tenantOnlyPlan.includes("Seq Scan")) {
        throw new Error(
          "FAIL: adding core.has_module() to the policy made the planner drop the business_id index scan",
        );
      }
      const MAX_ACCEPTABLE_RATIO = 5;
      if (ratio > MAX_ACCEPTABLE_RATIO) {
        throw new Error(
          `FAIL: tenant+licensed query is ${ratio.toFixed(2)}x slower than tenant-only (max acceptable ${MAX_ACCEPTABLE_RATIO}x) -- ` +
            "consider inlining has_module()'s check directly into the policy instead of calling the function.",
        );
      }

      console.log(
        `\nok: tenant AND licensed pattern stays within ${MAX_ACCEPTABLE_RATIO}x of plain tenant RLS at ${ROW_COUNT.toLocaleString()} rows -- no helper change needed.`,
      );
    },
  });
}

main();
