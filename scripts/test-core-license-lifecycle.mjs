#!/usr/bin/env node
/**
 * ADR-9's full lifecycle (Epic 2, story C-4), via the shared harness (C-8). Mirrors
 * exactly what `packages/core/src/licensing/lifecycle.ts` does at each step -- this
 * script's own SQL is the same statements those TS functions issue through the admin
 * client, so it exercises the real state machine, not a paraphrase of it. Written
 * alongside wiring `expireGracePeriods()` to a real cron route
 * (`api/cron/expire-licenses`, docs/testing/EXECUTION-2026-09-08.md finding 1) --
 * previously this transition had zero automated coverage, RLS-level or otherwise.
 *
 * TC-CORE-002/003/004's own "needs backdated fixture data, not a real 30-day wait"
 * callout, done literally: Alice's license gets a `grace_ends_at` in the past,
 * Bob's in the future, and the exact same `expireGracePeriods()` query runs once
 * against both.
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
    dbNamePrefix: "core_license_lifecycle_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two businesses, both with an active fsm license...");
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
      const aliceLicense = psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'fsm', 'active' from core.businesses where id = '${aliceBusiness}'
        returning id;
      `);
      const bobLicense = psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'fsm', 'active' from core.businesses where id = '${bobBusiness}'
        returning id;
      `);
      const aliceParty = psqlAsAlice(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Alice Customer') returning id;`);
      psqlAsAlice(`insert into fsm.opportunities (business_id, party_id, description, source) values ('${aliceBusiness}', '${aliceParty}', 'x', 'manual');`);

      console.log("Verifying active license: read and write both work...");
      assertEqual(psqlAsAlice("select count(*) from fsm.opportunities"), "1", "Alice reads her own opportunity while active");
      psqlAsAlice(`insert into fsm.opportunities (business_id, party_id, description, source)
        select business_id, party_id, 'y', 'manual' from fsm.opportunities limit 1`);
      assertEqual(psqlAsAlice("select count(*) from fsm.opportunities"), "2", "Alice can write while active");

      console.log("Cancelling Alice's license (deactivateLicense: status -> grace, grace_ends_at = now()+30d)...");
      psql(`
        update core.licenses set status = 'grace', deactivated_at = now(), grace_ends_at = now() + interval '30 days'
        where id = '${aliceLicense}';
        insert into core.license_events (license_id, business_id, module_key, event_type)
        values ('${aliceLicense}', '${aliceBusiness}', 'fsm', 'deactivated');
      `);

      console.log("Verifying TC-CORE-002: grace denies writes, still allows reads...");
      assertEqual(psqlAsAlice("select count(*) from fsm.opportunities"), "2", "Alice can still read during grace (ADR-9 -- read-only, not denied)");
      assertThrows(
        () => psqlAsAlice(`insert into fsm.opportunities (business_id, party_id, description, source)
          select business_id, party_id, 'z', 'manual' from fsm.opportunities limit 1`),
        "Alice cannot write during grace",
      );
      assertEqual(
        psql(`select event_type from core.license_events where license_id = '${aliceLicense}' order by created_at desc limit 1`),
        "deactivated",
        "core.license_events records the cancellation",
      );

      console.log("Backdating Alice's grace window (elapsed) and leaving Bob's untouched, then running the exact expireGracePeriods() query...");
      psql(`update core.licenses set status = 'grace', deactivated_at = now(), grace_ends_at = now() - interval '1 day' where id = '${aliceLicense}';`);
      psql(`update core.licenses set status = 'grace', deactivated_at = now(), grace_ends_at = now() + interval '10 days' where id = '${bobLicense}';`);

      const expired = psql(`
        update core.licenses set status = 'expired'
        where status = 'grace' and grace_ends_at <= now()
        returning id, business_id, module_key;
      `);
      for (const row of expired.split("\n").filter(Boolean)) {
        const [id, businessId, moduleKey] = row.split("|");
        psql(`insert into core.license_events (license_id, business_id, module_key, event_type) values ('${id}', '${businessId}', '${moduleKey}', 'expired');`);
      }

      assertEqual(expired.split("\n").filter(Boolean).length, 1, "exactly one license (Alice's, past its grace window) was expired");
      assertEqual(expired.includes(aliceLicense), true, "the expired row is Alice's license");
      assertEqual(expired.includes(bobLicense), false, "Bob's license (grace window not yet elapsed) was not touched");
      assertEqual(psql(`select status from core.licenses where id = '${bobLicense}'`), "grace", "Bob's license is still in grace, untouched by the sweep");

      console.log("Verifying TC-CORE-003: expired denies reads too, but the data is retained, not deleted...");
      assertEqual(psqlAsAlice("select count(*) from fsm.opportunities"), "0", "Alice can no longer read once expired -- denied by RLS, not just the UI");
      assertEqual(psql("select count(*) from fsm.opportunities"), "2", "the rows themselves still physically exist -- ADR-9's 'never delete' guarantee, checked as superuser bypassing RLS");
      assertEqual(
        psql(`select status from core.licenses where id = '${aliceLicense}'`),
        "expired",
        "core.licenses itself records the terminal state, not a deleted row",
      );
      assertEqual(
        psql(`select event_type from core.license_events where license_id = '${aliceLicense}' order by created_at desc limit 1`),
        "expired",
        "core.license_events records the expiry transition too",
      );

      console.log("Verifying TC-CORE-004: reactivation (activateLicense on an existing row) restores full access immediately...");
      psql(`
        update core.licenses set status = 'active', deactivated_at = null, grace_ends_at = null, activated_at = now()
        where id = '${aliceLicense}';
        insert into core.license_events (license_id, business_id, module_key, event_type)
        values ('${aliceLicense}', '${aliceBusiness}', 'fsm', 'reactivated');
      `);
      assertEqual(psqlAsAlice("select count(*) from fsm.opportunities"), "2", "read access fully restored, same 2 rows as before -- reactivation doesn't recreate data, it was never gone");
      psqlAsAlice(`insert into fsm.opportunities (business_id, party_id, description, source)
        select business_id, party_id, 'w', 'manual' from fsm.opportunities limit 1`);
      assertEqual(psqlAsAlice("select count(*) from fsm.opportunities"), "3", "write access restored too, no separate re-provisioning step needed");

      console.log("Verifying Bob was never affected by anything done to Alice's license throughout...");
      assertEqual(psqlAsBob("select count(*) from fsm.opportunities"), "0", "Bob still sees zero -- his own business never had any opportunities, and Alice's license changes never leaked across tenants");
      assertEqual(psql(`select status from core.licenses where id = '${bobLicense}'`), "grace", "Bob's license is exactly where this test left it -- untouched by Alice's cancel/expire/reactivate cycle");

      console.log("All core license-lifecycle checks passed.");
    },
  });
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
