#!/usr/bin/env node
/**
 * Behavior + concurrency test for core.number_sequences/core.next_number() (Epic 3,
 * story D-5; backlog requires a concurrent-caller test explicitly). Via the shared
 * harness (C-8).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_number_sequences_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, psqlAsAsync, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
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
      // fiscal_year_start_month defaults to 4 (April) -- pin "today" via a fixed FY
      // isn't needed for these assertions since we only compare numbers minted within
      // the same test run, all landing in the same fiscal year regardless of the date.

      console.log("Verifying sequential, gap-free numbering within one scope...");
      const first = psqlAsAlice(`select core.next_number('${aliceBusiness}', 'sales_order', 'SO')`);
      const second = psqlAsAlice(`select core.next_number('${aliceBusiness}', 'sales_order', 'SO')`);
      const third = psqlAsAlice(`select core.next_number('${aliceBusiness}', 'sales_order', 'SO')`);
      const fyMatch = first.match(/^SO\/(\d{2}-\d{2})\/0001$/);
      if (!fyMatch) throw new Error(`FAIL: unexpected format for first number: "${first}"`);
      const fy = fyMatch[1];
      assertEqual(second, `SO/${fy}/0002`, "the second number in the same scope is sequential");
      assertEqual(third, `SO/${fy}/0003`, "the third number in the same scope is sequential");

      console.log("Verifying separate scopes have independent counters...");
      const invoice1 = psqlAsAlice(`select core.next_number('${aliceBusiness}', 'invoice', 'INV')`);
      assertEqual(invoice1, `INV/${fy}/0001`, "a different scope starts its own counter at 1, unaffected by 'sales_order'");

      console.log("Verifying separate businesses have independent counters for the same scope...");
      const bobFirst = psqlAsBob(`select core.next_number('${bobBusiness}', 'sales_order', 'SO')`);
      assertEqual(bobFirst, `SO/${fy}/0001`, "Bob's business starts its own 'sales_order' counter at 1, unaffected by Alice's");

      console.log("Verifying core.number_sequences has no client-facing RLS policies...");
      assertEqual(
        psqlAsAlice(`select count(*) from core.number_sequences`),
        "0",
        "the counter table itself is unreadable directly (zero policies), even by a member of the business it belongs to, though rows exist",
      );

      console.log("Verifying a non-member cannot mint a number for another business...");
      assertThrows(
        () => psqlAsBob(`select core.next_number('${aliceBusiness}', 'sales_order', 'SO')`),
        "Bob cannot mint a number for Alice's business",
      );

      console.log("Verifying 20 concurrent callers get 20 distinct, gap-free numbers...");
      const CONCURRENT_CALLS = 20;
      const results = await Promise.all(
        Array.from({ length: CONCURRENT_CALLS }, () =>
          psqlAsAsync(ALICE, `select core.next_number('${aliceBusiness}', 'concurrent_scope', 'CS')`),
        ),
      );
      const numbers = results.map((r) => {
        const match = r.match(/CS\/\d{2}-\d{2}\/(\d{4})/);
        if (!match) throw new Error(`FAIL: unexpected concurrent result: "${r}"`);
        return Number(match[1]);
      });
      const uniqueNumbers = new Set(numbers);
      assertEqual(uniqueNumbers.size, CONCURRENT_CALLS, `all ${CONCURRENT_CALLS} concurrent calls got distinct numbers (no duplicates)`);
      const sorted = [...uniqueNumbers].sort((a, b) => a - b);
      assertEqual(sorted[0], 1, "the concurrent run's numbers start at 1");
      assertEqual(sorted[sorted.length - 1], CONCURRENT_CALLS, `the concurrent run's numbers end at ${CONCURRENT_CALLS}, with no gaps in between (sequential set)`);

      console.log("\nAll core.number_sequences checks passed.");
    },
  });
}

main();
