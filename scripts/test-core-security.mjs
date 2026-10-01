#!/usr/bin/env node
/**
 * DB test for core.api_rate_limit_counters + core.rate_limit_hit()
 * (20260908090000_core_security.sql): the limit is enforced per bucket and per window,
 * and only the service role can call it or read the counters.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");
const ALICE = "11111111-1111-1111-1111-111111111111";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_security_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com');`);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      console.log("Verifying the limit is enforced within one window...");
      assertEqual(asService(`select core.rate_limit_hit('t:a', 3600, 2)`), "t", "1st hit allowed");
      assertEqual(asService(`select core.rate_limit_hit('t:a', 3600, 2)`), "t", "2nd hit allowed");
      assertEqual(asService(`select core.rate_limit_hit('t:a', 3600, 2)`), "f", "3rd hit over the limit is refused");
      assertEqual(asService(`select core.rate_limit_hit('t:b', 3600, 2)`), "t", "a different bucket has its own count");

      console.log("Verifying windows are independent...");
      psql(`update core.api_rate_limit_counters set window_start = window_start - interval '2 hours' where bucket_key = 't:a'`);
      assertEqual(asService(`select core.rate_limit_hit('t:a', 3600, 2)`), "t", "a new window starts a fresh count");

      console.log("Verifying purge removes stale windows...");
      assertEqual(asService(`select core.purge_rate_limit_counters(interval '1 hour')`), "1", "the stale window is purged");

      console.log("Verifying non-service roles have no access...");
      assertThrows(() => psqlAs(ALICE, `select core.rate_limit_hit('t:x', 60, 1)`), "authenticated cannot call rate_limit_hit()");
      assertThrows(() => psqlAs(ALICE, `select count(*) from core.api_rate_limit_counters`), "authenticated cannot read the counters");
      assertThrows(() => asService(`select core.rate_limit_hit('t:x', 0, 1)`), "a non-positive window is rejected");

      console.log("\nAll core security checks passed.");
    },
  });
}

main();
