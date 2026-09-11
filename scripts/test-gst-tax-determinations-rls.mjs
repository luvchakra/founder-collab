#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + immutability test for `gst.tax_determinations`
 * (COMPLY-P0-02.5). Unlike `gst.tax_registrations`/`gst.compliance_profiles`, INSERT here
 * requires only module licensing, NOT `settings.manage` -- recording a determination is
 * an automatic byproduct of completing an ordinary transaction, not a settings action
 * (same shape `core.domain_events`'s own INSERT policy already uses) -- and there is no
 * UPDATE/DELETE policy at all: a determination is an immutable snapshot once written.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no settings.manage
const BOB = "22222222-2222-2222-2222-222222222222"; // separate business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_tax_determinations_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${CAROL}', 'carol@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert on gst.tax_determinations to authenticated;
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

      const insertDetermination = (business, ref, taxAmount) => `
        insert into gst.tax_determinations
          (business_id, source_module, source_reference, country, regime, treatment, taxable_amount, tax_amount)
        values ('${business}', 'fsm', '${ref}', 'IN', 'GST', 'standard', 1000, ${taxAmount})
        returning id
      `;

      console.log("Without a gst license, Alice cannot record a determination yet...");
      assertThrows(
        () => psqlAsAlice(insertDetermination(aliceBusiness, "invoice-1", 180)),
        "Alice's business has no gst license yet",
      );

      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id = '${aliceBusiness}';
      `);

      console.log("Carol (viewer, no settings.manage) CAN record a determination -- this table's INSERT is licensed-membership only, not a settings action (same shape core.domain_events already uses)...");
      const det1 = psqlAsCarol(insertDetermination(aliceBusiness, "invoice-1", 180));

      console.log("Alice (owner) can also record one, including for the same transaction reference (a recompute)...");
      const det2 = psqlAsAlice(insertDetermination(aliceBusiness, "invoice-1", 190));

      console.log("Both snapshots for the same transaction still exist -- recomputing never overwrites the prior snapshot...");
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.tax_determinations where business_id = '${aliceBusiness}' and source_reference = 'invoice-1'`),
        "2",
        "both determination snapshots for invoice-1 are retained",
      );

      console.log("The most recent snapshot (by computed_at) is det2's 190, not det1's stale 180...");
      assertEqual(
        psqlAsAlice(`
          select tax_amount from gst.tax_determinations
          where business_id = '${aliceBusiness}' and source_reference = 'invoice-1'
          order by computed_at desc limit 1
        `),
        "190.00",
        "the latest-first read picks the recompute, not the original",
      );

      console.log("Nobody, not even the owner, can update a determination snapshot after the fact (no UPDATE policy -- immutability)...");
      assertThrows(
        () => psqlAsAlice(`update gst.tax_determinations set tax_amount = 0 where id = '${det1}'`),
        "no UPDATE policy exists on gst.tax_determinations",
      );

      console.log("Nobody can delete one either (no DELETE policy -- the audit trail is permanent)...");
      assertThrows(
        () => psqlAsAlice(`delete from gst.tax_determinations where id = '${det2}'`),
        "no DELETE policy exists on gst.tax_determinations",
      );

      console.log("Tenant isolation: Bob cannot see or record determinations for Alice's business...");
      assertEqual(
        psqlAsBob(`select count(*)::int from gst.tax_determinations where business_id = '${aliceBusiness}'`),
        "0",
        "Bob's RLS-scoped read of Alice's business returns nothing",
      );
      assertThrows(
        () => psqlAsBob(insertDetermination(aliceBusiness, "invoice-1", 999)),
        "Bob cannot record a determination against Alice's business_id",
      );

      console.log("All gst.tax_determinations RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
