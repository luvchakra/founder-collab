#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for
 * `gst.eway_bill_movements` (COMPLY-P0-06.2), via the shared harness (C-8).
 *
 * NOTE on the cross-tenant "update" assertions below: unlike an INSERT (or an UPDATE that
 * would move a row so its own WITH CHECK policy fails), Postgres does NOT raise an error
 * for an UPDATE whose WHERE clause -- including an RLS USING clause that hides the row
 * entirely from the caller -- simply matches zero rows; it just reports "UPDATE 0" and
 * succeeds. Several earlier scripts in this suite (test-gst-tax-registrations-rls.mjs,
 * test-gst-compliance-profile-rls.mjs) wrap exactly this kind of cross-tenant UPDATE in
 * `assertThrows`, which is incorrect and fails the moment this harness is actually run
 * against a real Postgres (this session's own environment note: local Postgres works here
 * for the first time this backlog has had it available -- see this story's own audit log
 * entry). That is a pre-existing test-authoring bug unrelated to this story's own table,
 * out of this run's scope to fix (CLAUDE.md non-negotiable "do not refactor unrelated
 * code") -- flagged here, not silently repeated: this script instead asserts a
 * cross-tenant update is a no-op by re-reading the value afterward.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner in her own business
const BOB = "22222222-2222-2222-2222-222222222222"; // owner in a separate business
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business -- no gst.generate

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_eway_bill_movements_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      console.log("Seeding two businesses, a viewer member, an invoice each, no gst license yet...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert, update on gst.eway_bill_movements to authenticated;
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
      `);
      const aliceParty = psqlAsAlice(`insert into core.parties (business_id, kind, name) values ('${aliceBusiness}', 'company', 'Alice Customer') returning id;`);
      const bobParty = psqlAsBob(`insert into core.parties (business_id, kind, name) values ('${bobBusiness}', 'company', 'Bob Customer') returning id;`);
      const aliceInvoice = psqlAsAlice(`insert into core.documents (business_id, doc_type, source_module, party_id, number) values ('${aliceBusiness}', 'invoice', 'fsm', '${aliceParty}', 'INV/26-27/0001') returning id;`);
      const bobInvoice = psqlAsBob(`insert into core.documents (business_id, doc_type, source_module, party_id, number) values ('${bobBusiness}', 'invoice', 'fsm', '${bobParty}', 'INV/26-27/0002') returning id;`);

      const insertMovement = (business, document, distanceKm = 150) => `
        insert into gst.eway_bill_movements (business_id, document_id, distance_km, transport_mode, vehicle_number)
        values ('${business}', '${document}', ${distanceKm}, 'road', 'KA01AB1234')
        returning id
      `;

      console.log("Verifying no gst license at all denies both read and write...");
      assertThrows(() => psqlAsAlice(insertMovement(aliceBusiness, aliceInvoice)), "with no gst license at all, Alice (owner) cannot record movement data");
      assertEqual(psqlAsAlice("select count(*) from gst.eway_bill_movements"), "0", "sanity: nothing exists yet");

      console.log("Activating a grace-period license: read allowed, write still denied...");
      psql(`insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at) select account_id, id, 'gst', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';`);
      assertThrows(() => psqlAsAlice(insertMovement(aliceBusiness, aliceInvoice)), "a grace-period gst license still denies writes");
      assertEqual(psqlAsAlice("select count(*)::int from gst.eway_bill_movements"), "0", "grace-period read succeeds but sees nothing yet (none exist)");

      console.log("Activating the license: owner (gst.generate) can write, viewer (no gst.generate) cannot...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'gst';`);
      assertThrows(() => psqlAsCarol(insertMovement(aliceBusiness, aliceInvoice)), "Carol (viewer, no gst.generate) cannot record movement data even with an active license");
      const aliceMovement = psqlAsAlice(insertMovement(aliceBusiness, aliceInvoice));

      console.log("Defaults: transaction_type='regular', vehicle_type='regular' when not specified...");
      assertEqual(
        psqlAsAlice(`select transaction_type || ',' || vehicle_type from gst.eway_bill_movements where id = '${aliceMovement}'`),
        "regular,regular",
        "unspecified classification columns take their documented defaults",
      );

      console.log("Carol (viewer, licensed-read only) can still read movement data -- no gst.generate needed to view...");
      assertEqual(
        psqlAsCarol(`select distance_km from gst.eway_bill_movements where id = '${aliceMovement}'`),
        "150",
        "read-only members can see recorded movement data",
      );

      console.log("Alice (gst.generate) can update her own movement record...");
      psqlAsAlice(`update gst.eway_bill_movements set distance_km = 250, vehicle_type = 'over_dimensional_cargo' where id = '${aliceMovement}';`);
      assertEqual(
        psqlAsAlice(`select distance_km || ',' || vehicle_type from gst.eway_bill_movements where id = '${aliceMovement}'`),
        "250,over_dimensional_cargo",
        "the update actually persisted",
      );

      console.log("The check constraint rejects an unrecognized vehicle_type / transaction_type / transport_mode...");
      assertThrows(() => psqlAsAlice(`update gst.eway_bill_movements set vehicle_type = 'giant' where id = '${aliceMovement}'`), "vehicle_type check constraint");
      assertThrows(() => psqlAsAlice(`update gst.eway_bill_movements set transaction_type = 'not_a_real_type' where id = '${aliceMovement}'`), "transaction_type check constraint");
      assertThrows(() => psqlAsAlice(`update gst.eway_bill_movements set transport_mode = 'teleport' where id = '${aliceMovement}'`), "transport_mode check constraint");

      console.log("A negative distance is rejected by the check constraint...");
      assertThrows(() => psqlAsAlice(`update gst.eway_bill_movements set distance_km = -5 where id = '${aliceMovement}'`), "distance_km >= 0 check constraint");

      console.log("dispatch_from_override / ship_to_override round-trip as jsonb...");
      psqlAsAlice(`update gst.eway_bill_movements set dispatch_from_override = '{"name": "Warehouse 2", "pincode": "560001"}'::jsonb where id = '${aliceMovement}';`);
      assertEqual(
        psqlAsAlice(`select dispatch_from_override ->> 'pincode' from gst.eway_bill_movements where id = '${aliceMovement}'`),
        "560001",
        "the override jsonb round-trips",
      );

      console.log("Verifying the one-row-per-document constraint (unique(business_id, document_id))...");
      assertThrows(() => psqlAsAlice(insertMovement(aliceBusiness, aliceInvoice)), "a second movement record for the same document is rejected");

      console.log("Verifying the cross-tenant document_id-smuggling trigger...");
      psql(`insert into core.licenses (account_id, business_id, module_key, status) select account_id, id, 'gst', 'active' from core.businesses where id = '${bobBusiness}';`);
      assertThrows(
        () => psqlAsBob(insertMovement(bobBusiness, aliceInvoice)),
        "Bob cannot record movement data against Alice's document_id, even claiming his own business_id",
      );

      console.log("Tenant isolation on SELECT: Bob cannot see Alice's movement data...");
      psqlAsBob(insertMovement(bobBusiness, bobInvoice, 80));
      assertEqual(psqlAsAlice(`select count(*)::int from gst.eway_bill_movements where business_id = '${aliceBusiness}'`), "1", "Alice sees only her own movement row");
      assertEqual(psqlAsBob(`select count(*)::int from gst.eway_bill_movements where business_id = '${aliceBusiness}'`), "0", "Bob's RLS-scoped read of Alice's business returns nothing");

      console.log("Tenant isolation on UPDATE: Bob's update of Alice's row (by id) is a silent no-op under RLS, not applied...");
      psqlAsBob(`update gst.eway_bill_movements set distance_km = 999999 where id = '${aliceMovement}'`);
      assertEqual(
        psqlAsAlice(`select distance_km from gst.eway_bill_movements where id = '${aliceMovement}'`),
        "250",
        "Alice's own row is unchanged by Bob's attempted cross-tenant update (RLS hid it from him; zero rows matched)",
      );

      console.log("Nobody, not even the owner, can delete a movement record (no delete policy)...");
      assertThrows(() => psqlAsAlice(`delete from gst.eway_bill_movements where id = '${aliceMovement}'`), "no delete policy exists on gst.eway_bill_movements");

      console.log("All gst.eway_bill_movements RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
