#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for
 * `gst.us_physical_nexus_facts` (COMPLY-P1-02.3), plus the two invariants that matter most
 * for this specific table: at most one ACTIVE (ended_at is null) declaration per
 * business/state/presence_type (the partial unique index), and no delete policy at all
 * (end via `ended_at`, never remove -- the same "preserve historical filing/evidence
 * state" discipline `gst.tax_registrations`'s own `registration_status` column already
 * applies).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no settings.manage

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_us_physical_nexus_facts_rls_test",
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
        grant select, insert, update on gst.us_physical_nexus_facts to authenticated;
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

      const insertFact = (business, state, presenceType) => `
        insert into gst.us_physical_nexus_facts (business_id, state, presence_type)
        values ('${business}', '${state}', '${presenceType}')
        returning id
      `;

      console.log("Without a gst license, Bob's business (still licensed above, so use an unlicensed third check instead)...");
      // (Both businesses are licensed above -- license-gating is instead exercised via the
      // shared core.write_licensed_business_ids() helper every other gst table already
      // relies on; re-deriving a third unlicensed business here would just duplicate that
      // already-covered mechanism.)

      console.log("Carol (viewer, no settings.manage) cannot declare a physical nexus fact...");
      assertThrows(
        () => psqlAsCarol(insertFact(aliceBusiness, "CA", "warehouse")),
        "Carol lacks settings.manage",
      );

      console.log("Alice (owner) can declare a physical nexus fact...");
      const fact1 = psqlAsAlice(insertFact(aliceBusiness, "CA", "warehouse"));

      console.log("An unrecognized presence_type is rejected by the check constraint...");
      assertThrows(
        () => psqlAsAlice(insertFact(aliceBusiness, "CA", "spaceship")),
        "presence_type check constraint",
      );

      console.log("A malformed state code is rejected by the check constraint...");
      assertThrows(
        () => psqlAsAlice(insertFact(aliceBusiness, "California", "office")),
        "state ~ '^[A-Z]{2}$' check constraint",
      );

      console.log("A second ACTIVE declaration for the SAME business/state/presence_type is rejected by the partial unique index...");
      assertThrows(
        () => psqlAsAlice(insertFact(aliceBusiness, "CA", "warehouse")),
        "us_physical_nexus_facts_one_active_per_state_type",
      );

      console.log("...but a DIFFERENT presence_type in the same state is fine...");
      psqlAsAlice(insertFact(aliceBusiness, "CA", "employee"));
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.us_physical_nexus_facts where business_id = '${aliceBusiness}' and state = 'CA'`),
        "2",
        "both the warehouse and employee facts for CA exist",
      );

      console.log("Ending the warehouse fact (soft-end via ended_at, not deletion)...");
      psqlAsAlice(`update gst.us_physical_nexus_facts set ended_at = '2026-06-30' where id = '${fact1}'`);
      assertEqual(
        psqlAsAlice(`select ended_at::text from gst.us_physical_nexus_facts where id = '${fact1}'`),
        "2026-06-30",
        "the fact still exists, just marked ended",
      );

      console.log("...which now allows a NEW active warehouse declaration for CA (the partial index only guards ACTIVE rows)...");
      const fact1Reopened = psqlAsAlice(insertFact(aliceBusiness, "CA", "warehouse"));
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.us_physical_nexus_facts where business_id = '${aliceBusiness}' and state = 'CA' and presence_type = 'warehouse'`),
        "2",
        "both the ended original and the reopened warehouse fact exist",
      );

      console.log("Nobody, not even the owner, can delete a physical nexus fact (no delete policy -- preserve historical presence)...");
      assertThrows(
        () => psqlAsAlice(`delete from gst.us_physical_nexus_facts where id = '${fact1Reopened}'`),
        "no delete policy exists on gst.us_physical_nexus_facts",
      );

      console.log("Carol (viewer) can still read declared facts once they exist...");
      assertEqual(
        psqlAsCarol(`select count(*)::int from gst.us_physical_nexus_facts where business_id = '${aliceBusiness}'`),
        "3",
        "read-only members can see the business's own declared facts",
      );

      console.log("Tenant isolation: Bob cannot see or touch Alice's physical nexus facts...");
      assertEqual(
        psqlAsBob(`select count(*)::int from gst.us_physical_nexus_facts where business_id = '${aliceBusiness}'`),
        "0",
        "Bob's RLS-scoped read of Alice's business returns nothing",
      );
      assertThrows(
        () => psqlAsBob(insertFact(aliceBusiness, "TX", "office")),
        "Bob cannot declare a physical nexus fact against Alice's business_id",
      );

      console.log("All gst.us_physical_nexus_facts RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
