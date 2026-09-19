#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for `gst.finance_activation`
 * (FIN-3), plus its own specific invariants: one row per business (primary key on
 * `business_id`, so a second insert for the same business collides rather than creating a
 * duplicate), and no delete policy.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no gst.activation.manage

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_finance_activation_rls_test",
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
        grant select, insert, update on gst.finance_activation to authenticated;
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

      const insertActivation = (business, activatedBy) => `
        insert into gst.finance_activation (business_id, activated_at, activated_by)
        values ('${business}', now(), '${activatedBy}')
        returning business_id
      `;

      console.log("Carol (viewer, no gst.activation.manage) cannot activate...");
      assertThrows(() => psqlAsCarol(insertActivation(aliceBusiness, CAROL)), "Carol lacks gst.activation.manage");

      console.log("Alice (owner) can activate her own business...");
      const activatedBusinessId = psqlAsAlice(insertActivation(aliceBusiness, ALICE));
      assertEqual(activatedBusinessId, aliceBusiness, "row created for Alice's business");
      assertEqual(psqlAsAlice(`select activated_by from gst.finance_activation where business_id = '${aliceBusiness}'`), ALICE, "activated_by recorded");

      console.log("A second activation row for the SAME business collides on the primary key...");
      assertThrows(() => psqlAsAlice(insertActivation(aliceBusiness, ALICE)), "duplicate primary key on business_id");

      console.log("Alice can re-run activation via upsert (update, not a second row)...");
      psqlAsAlice(`update gst.finance_activation set updated_at = now() where business_id = '${aliceBusiness}'`);
      assertEqual(psqlAsAlice(`select count(*)::int from gst.finance_activation where business_id = '${aliceBusiness}'`), "1", "still one row");

      console.log("Carol (viewer) CAN read Alice's activation row (read is open to any business member)...");
      assertEqual(psqlAsCarol(`select count(*)::int from gst.finance_activation where business_id = '${aliceBusiness}'`), "1", "viewer can read it");

      console.log("Bob cannot read Alice's activation row at all (tenant isolation)...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.finance_activation where business_id = '${aliceBusiness}'`), "0", "cross-tenant read returns nothing");

      console.log("Bob can activate his own business independently...");
      const bobRow = psqlAsBob(insertActivation(bobBusiness, BOB));
      assertEqual(bobRow, bobBusiness, "Bob's own activation row created");

      console.log("There is NO delete policy on finance_activation -- even Alice cannot delete her own row...");
      assertThrows(() => psqlAsAlice(`delete from gst.finance_activation where business_id = '${aliceBusiness}'`), "no delete policy on finance_activation");

      console.log("All gst.finance_activation RLS assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
