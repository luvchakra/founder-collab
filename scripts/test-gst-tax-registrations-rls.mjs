#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for
 * `gst.tax_registrations` (COMPLY-P0-02.1), plus the two invariants that matter most for
 * this specific table: at most one `is_primary` registration per business/country/regime
 * (the partial unique index), and no delete policy at all (cancel via
 * `registration_status`, never remove -- ADR-9's own "cancel never deletes" applied at
 * the row level).
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
    dbNamePrefix: "gst_tax_registrations_rls_test",
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
        grant select, insert, update on gst.tax_registrations to authenticated;
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

      const insertReg = (business, gstin, primary) => `
        insert into gst.tax_registrations (business_id, country, jurisdiction, regime, registration_number, is_primary)
        values ('${business}', 'IN', 'Karnataka', 'GST', '${gstin}', ${primary})
        returning id
      `;

      console.log("Carol (viewer, no settings.manage) cannot create a registration...");
      assertThrows(
        () => psqlAsCarol(insertReg(aliceBusiness, "29AAAAA0000A1Z5", "true")),
        "Carol lacks settings.manage",
      );

      console.log("Alice (owner) can create a primary registration...");
      const reg1 = psqlAsAlice(insertReg(aliceBusiness, "29AAAAA0000A1Z5", "true"));

      console.log("A second primary registration for the SAME business/country/regime is rejected by the unique index...");
      assertThrows(
        () => psqlAsAlice(insertReg(aliceBusiness, "27BBBBB1111B2Z6", "true")),
        "the partial unique index allows only one is_primary=true row per business/country/regime",
      );

      console.log("...but a second NON-primary registration for the same business/country/regime is fine...");
      const reg2 = psqlAsAlice(insertReg(aliceBusiness, "27BBBBB1111B2Z6", "false"));
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.tax_registrations where business_id = '${aliceBusiness}'`),
        "2",
        "both registrations exist",
      );

      console.log("Moving primary status from reg1 to reg2 (demote then promote)...");
      psqlAsAlice(`update gst.tax_registrations set is_primary = false where id = '${reg1}'`);
      psqlAsAlice(`update gst.tax_registrations set is_primary = true where id = '${reg2}'`);
      assertEqual(
        psqlAsAlice(`select registration_number from gst.tax_registrations where business_id = '${aliceBusiness}' and is_primary`),
        "27BBBBB1111B2Z6",
        "reg2 is now the sole primary registration",
      );

      console.log("Cancelling a registration (status change, not deletion)...");
      psqlAsAlice(`update gst.tax_registrations set registration_status = 'cancelled' where id = '${reg1}'`);
      assertEqual(
        psqlAsAlice(`select registration_status from gst.tax_registrations where id = '${reg1}'`),
        "cancelled",
        "the registration row still exists, just marked cancelled",
      );

      console.log("Nobody, not even the owner, can delete a tax registration row (no delete policy)...");
      assertThrows(
        () => psqlAsAlice(`delete from gst.tax_registrations where id = '${reg1}'`),
        "no delete policy exists on gst.tax_registrations",
      );

      console.log("Carol (viewer) can still read registrations once they exist...");
      assertEqual(
        psqlAsCarol(`select count(*)::int from gst.tax_registrations where business_id = '${aliceBusiness}'`),
        "2",
        "read-only members can see the business's registrations",
      );

      console.log("Tenant isolation: Bob cannot see or touch Alice's registrations...");
      assertEqual(
        psqlAsBob(`select count(*)::int from gst.tax_registrations where business_id = '${aliceBusiness}'`),
        "0",
        "Bob's RLS-scoped read of Alice's business returns nothing",
      );
      assertThrows(
        () => psqlAsBob(`update gst.tax_registrations set registration_number = 'HACKED' where business_id = '${aliceBusiness}'`),
        "Bob cannot update Alice's registrations",
      );

      console.log("gst.compliance_profiles.registration_id can now point at a real registration (FK wired this story)...");
      psqlAsAlice(`
        insert into gst.compliance_profiles (business_id, country, regime, registration_id)
        values ('${aliceBusiness}', 'IN', 'GST', '${reg2}')
        on conflict (business_id) do update set registration_id = excluded.registration_id;
      `);
      assertEqual(
        psqlAsAlice(`select registration_id from gst.compliance_profiles where business_id = '${aliceBusiness}'`),
        reg2,
        "the compliance profile now references the real registration",
      );

      console.log("Deleting a referenced registration sets compliance_profiles.registration_id to null (on delete set null)...");
      // No authenticated role can ever delete a registration (no delete RLS policy) --
      // this exercises the FK behavior itself via the harness's own superuser psql()
      // connection, the only way to reach a delete on this table at all.
      psql(`delete from gst.tax_registrations where id = '${reg2}'`);
      assertEqual(
        psql(`select registration_id is null from gst.compliance_profiles where business_id = '${aliceBusiness}'`),
        "t",
        "the compliance profile's registration_id is cleared, not left dangling or cascaded away",
      );

      console.log("All gst.tax_registrations RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
