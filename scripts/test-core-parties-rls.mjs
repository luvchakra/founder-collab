#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.parties/party_roles/party_contacts/
 * party_supplier_attrs (Epic 3, story D-1; CLAUDE.md principle 9). Same throwaway-
 * database approach as test-discovery-rls.mjs, now via the shared harness (C-8).
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
    dbNamePrefix: "core_parties_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
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

      console.log("Seeding a prospect-turned-customer party for Alice, a supplier for Bob...");
      const aliceParty = psqlAsAlice(`
        insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Acme Inc') returning id;
      `);
      psqlAsAlice(`
        insert into core.party_roles (business_id, party_id, role) values ('${aliceBusiness}', '${aliceParty}', 'prospect');
        insert into core.party_contacts (business_id, party_id, first_name, last_name, email)
        values ('${aliceBusiness}', '${aliceParty}', 'Jane', 'Doe', 'jane@acme.test');
      `);
      const bobParty = psqlAsBob(`
        insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bolt Supply') returning id;
      `);
      psqlAsBob(`
        insert into core.party_roles (business_id, party_id, role) values ('${bobBusiness}', '${bobParty}', 'supplier');
        insert into core.party_supplier_attrs (party_id, business_id, code, lead_time_days, rating)
        values ('${bobParty}', '${bobBusiness}', 'BOLT-01', 5, 4.5);
      `);

      console.log("Verifying tenant isolation (read)...");
      assertEqual(psqlAsAlice("select count(*) from core.parties"), "1", "Alice sees only her own party");
      assertEqual(psqlAsBob("select count(*) from core.parties"), "1", "Bob sees only his own party");
      assertEqual(psqlAsAlice("select count(*) from core.party_contacts"), "1", "Alice sees her own party's contact");
      assertEqual(psqlAsBob("select count(*) from core.party_contacts"), "0", "Bob sees none of Alice's contacts");
      assertEqual(psqlAsBob("select code from core.party_supplier_attrs"), "BOLT-01", "Bob sees his own supplier attrs");
      assertEqual(psqlAsAlice("select count(*) from core.party_supplier_attrs"), "0", "Alice sees none of Bob's supplier attrs");

      console.log("Verifying tenant isolation (write)...");
      assertThrows(
        () => psqlAsBob(`insert into core.party_roles (business_id, party_id, role) values ('${bobBusiness}', '${aliceParty}', 'customer')`),
        "Bob cannot attach a role to Alice's party (FK/RLS with-check)",
      );
      psqlAsAlice(`update core.parties set name = 'Hijacked' where id = '${bobParty}'`);
      assertEqual(psql(`select name from core.parties where id = '${bobParty}'`), "Bolt Supply", "Alice's update to Bob's party is a no-op (RLS using-clause excludes it), name unchanged");

      console.log("Verifying the 'one party, many roles' model...");
      psqlAsAlice(`insert into core.party_roles (business_id, party_id, role) values ('${aliceBusiness}', '${aliceParty}', 'customer');`);
      assertEqual(psqlAsAlice("select count(*) from core.party_roles"), "2", "the same party now holds both prospect and customer roles");
      assertEqual(psqlAsAlice("select count(distinct id) from core.parties"), "1", "winning a prospect did not create a second party row");

      console.log("Verifying party_roles' unique(party_id, role) constraint...");
      assertThrows(
        () => psqlAsAlice(`insert into core.party_roles (business_id, party_id, role) values ('${aliceBusiness}', '${aliceParty}', 'prospect')`),
        "adding a role a party already holds violates unique(party_id, role)",
      );

      console.log("\nAll core.parties RLS checks passed.");
    },
  });
}

main();
