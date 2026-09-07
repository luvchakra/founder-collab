#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.addresses/tax_identities (Epic 3, story D-2;
 * CLAUDE.md principle 9). Same throwaway-database approach as the other RLS scripts, via
 * the shared harness (C-8).
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
    dbNamePrefix: "core_addresses_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants with one party each...");
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
      const aliceParty = psqlAsAlice(`
        insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Acme Inc') returning id;
      `);
      const bobParty = psqlAsBob(`
        insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bolt Supply') returning id;
      `);

      console.log("Seeding addresses and tax identities...");
      psqlAsAlice(`
        insert into core.addresses (business_id, party_id, kind, is_primary, formatted, state)
        values ('${aliceBusiness}', '${aliceParty}', 'billing', true, '1 Acme Way', 'Maharashtra');
        insert into core.tax_identities (business_id, party_id, gstin, state)
        values ('${aliceBusiness}', '${aliceParty}', '27ALICE0001Z5', 'Maharashtra');
      `);
      psqlAsBob(`
        insert into core.addresses (business_id, party_id, kind, is_primary, formatted)
        values ('${bobBusiness}', '${bobParty}', 'shipping', true, '2 Bolt Road');
      `);

      console.log("Verifying tenant isolation (read)...");
      assertEqual(psqlAsAlice("select count(*) from core.addresses"), "1", "Alice sees only her own address");
      assertEqual(psqlAsBob("select count(*) from core.addresses"), "1", "Bob sees only his own address");
      assertEqual(psqlAsAlice("select gstin from core.tax_identities"), "27ALICE0001Z5", "Alice sees her own tax identity");
      assertEqual(psqlAsBob("select count(*) from core.tax_identities"), "0", "Bob sees none of Alice's tax identities");

      console.log("Verifying the cross-tenant party_id trigger applies to addresses too...");
      assertThrows(
        () => psqlAsBob(`insert into core.addresses (business_id, party_id, kind, formatted) values ('${bobBusiness}', '${aliceParty}', 'service', 'Nope')`),
        "Bob cannot attach an address to Alice's party",
      );

      console.log("Verifying the partial unique index (one primary address per party+kind)...");
      assertThrows(
        () => psqlAsAlice(`insert into core.addresses (business_id, party_id, kind, is_primary, formatted) values ('${aliceBusiness}', '${aliceParty}', 'billing', true, '2nd primary')`),
        "a second primary billing address for the same party violates the partial unique index",
      );
      psqlAsAlice(`insert into core.addresses (business_id, party_id, kind, is_primary, formatted) values ('${aliceBusiness}', '${aliceParty}', 'billing', false, 'non-primary billing')`);
      assertEqual(psqlAsAlice("select count(*) from core.addresses where kind = 'billing'"), "2", "a second NON-primary billing address for the same party is fine");

      console.log("Verifying tax_identities' one-per-party primary key...");
      assertThrows(
        () => psqlAsAlice(`insert into core.tax_identities (business_id, party_id, gstin) values ('${aliceBusiness}', '${aliceParty}', 'DUPLICATE')`),
        "a second tax identity row for the same party violates the party_id primary key",
      );

      console.log("\nAll core.addresses/tax_identities RLS checks passed.");
    },
  });
}

main();
