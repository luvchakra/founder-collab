#!/usr/bin/env node
/**
 * Tenant isolation for the exact multi-business batched-read pattern
 * `listLicensedModuleKeysByBusiness()` (packages/core/src/licensing/queries.ts) uses --
 * added 2026-09-08 alongside the sidebar license-filter fix (docs/testing/
 * EXECUTION-2026-09-08.md finding 5). Every prior core.licenses test scoped its query to
 * one business at a time; this is the first to pass several business_ids in one `.in()`
 * call (Alice's own business plus Bob's, exactly how the dashboard layout calls it with
 * every business on the current account) and confirm RLS still only returns the
 * caller's own rows -- Alice including Bob's business_id in the filter list must not
 * leak Bob's licenses back to her.
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
    dbNamePrefix: "core_licensed_modules_by_business_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two businesses with different license mixes...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
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
      // discovery is seeded free for every business elsewhere (seedDefaultLicenses) --
      // inserted directly here since this test seeds businesses by hand, not through it.
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'discovery', 'active' from core.businesses where id in ('${aliceBusiness}', '${bobBusiness}');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'fsm', 'active' from core.businesses where id = '${aliceBusiness}';
        insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
        select account_id, id, 'inventory', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'expired' from core.businesses where id = '${aliceBusiness}';
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'crm', 'active' from core.businesses where id = '${bobBusiness}';
      `);

      console.log("Verifying the batched query (both business_ids in one .in() filter) stays tenant-scoped...");
      const query = (bizA, bizB) => `
        select business_id, module_key
        from core.licenses
        where business_id in ('${bizA}', '${bizB}')
          and status in ('active', 'grace')
        order by business_id, module_key;
      `;

      assertEqual(
        psqlAsAlice(query(aliceBusiness, bobBusiness)).split("\n").filter(Boolean).length,
        3,
        "Alice sees exactly her own 3 active-or-grace rows (discovery, fsm, inventory) even though Bob's business_id is also in the filter -- gst is expired, so excluded",
      );
      assertEqual(
        psqlAsAlice(query(aliceBusiness, bobBusiness)).includes(bobBusiness),
        false,
        "none of the rows returned to Alice belong to Bob's business",
      );
      assertEqual(
        psqlAsBob(query(aliceBusiness, bobBusiness)).split("\n").filter(Boolean).length,
        2,
        "Bob sees exactly his own 2 active-or-grace rows (discovery, crm) -- same filter list, opposite result set",
      );
      assertEqual(
        psqlAsBob(query(aliceBusiness, bobBusiness)).includes(aliceBusiness),
        false,
        "none of the rows returned to Bob belong to Alice's business",
      );

      console.log("Verifying an unauthenticated caller (no auth.uid()) sees nothing from either business...");
      assertEqual(
        psql(`set local role authenticated; ${query(aliceBusiness, bobBusiness)}`),
        "",
        "no session, no rows, from either business",
      );

      console.log("All core licensed-modules-by-business tests passed.");
    },
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
