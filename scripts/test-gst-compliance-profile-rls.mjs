#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for `gst.compliance_profiles`
 * (COMPLY-P0-01.2/01.3/01.4), via the shared harness (C-8). Same shape as
 * test-gst-credentials-rls.mjs / test-gst-generation-history-rls.mjs: a normal
 * non-secret table, so SELECT is available to any tenant+licensed member, while
 * INSERT/UPDATE additionally require `settings.manage` (choosing the active Compliance
 * country/regime is a settings action, same gate the GST profile/credentials forms use).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner in her own business
const BOB = "22222222-2222-2222-2222-222222222222"; // owner in a separate business
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business -- no settings.manage

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_compliance_profile_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      console.log("Seeding two businesses, a viewer member, no gst license yet...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert, update on gst.compliance_profiles to authenticated;
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

      const upsertProfile = (business, country) => `
        insert into gst.compliance_profiles (business_id, country, regime)
        values ('${business}', '${country}', 'GST')
        on conflict (business_id) do update set country = excluded.country
      `;

      console.log("Verifying no gst license at all denies even the owner's write...");
      assertThrows(
        () => psqlAsAlice(upsertProfile(aliceBusiness, "IN")),
        "with no gst license at all, Alice (owner) cannot save a compliance profile",
      );

      console.log("Activating a grace-period license and re-checking (write needs active, not grace)...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
        select account_id, id, 'gst', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';
      `);
      assertThrows(
        () => psqlAsAlice(upsertProfile(aliceBusiness, "IN")),
        "a grace-period gst license still denies writes",
      );
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.compliance_profiles where business_id = '${aliceBusiness}'`),
        "0",
        "reads are also denied before the license is active (read policy requires licensed_business_ids, which excludes grace)",
      );

      console.log("Activating the license: owner can write, viewer (no settings.manage) cannot...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'gst';`);
      assertThrows(
        () => psqlAsCarol(upsertProfile(aliceBusiness, "IN")),
        "Carol (viewer, no settings.manage) cannot save a compliance profile even with an active license",
      );
      psqlAsAlice(upsertProfile(aliceBusiness, "IN"));

      console.log("Carol (viewer) can still read the profile once it exists...");
      assertEqual(
        psqlAsCarol(`select country from gst.compliance_profiles where business_id = '${aliceBusiness}'`),
        "IN",
        "read-only members can see the active Compliance country",
      );

      console.log("Alice can switch country (upsert updates the single row, not a second one)...");
      psqlAsAlice(upsertProfile(aliceBusiness, "IN")); // re-affirm same value is a no-op update, not an error
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.compliance_profiles where business_id = '${aliceBusiness}'`),
        "1",
        "exactly one profile row ever exists per business",
      );

      console.log("Verifying tenant isolation: Bob's own licensed business can't see or touch Alice's...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id = '${bobBusiness}';
      `);
      assertThrows(
        () => psqlAsBob(`update gst.compliance_profiles set country = 'US' where business_id = '${aliceBusiness}'`),
        "Bob cannot update Alice's compliance profile",
      );
      assertEqual(
        psqlAsBob(`select count(*)::int from gst.compliance_profiles where business_id = '${aliceBusiness}'`),
        "0",
        "Bob cannot even see Alice's profile row",
      );

      console.log("Verifying no delete policy exists at all (append/replace only, never remove)...");
      assertThrows(
        () => psqlAsAlice(`delete from gst.compliance_profiles where business_id = '${aliceBusiness}'`),
        "nobody, not even the owner, can delete a compliance profile row -- no delete policy",
      );

      console.log("All gst.compliance_profiles RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
