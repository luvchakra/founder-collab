#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for the `gst` schema's
 * credential tables (SP-7's GST slice), via the shared harness (C-8). Also verifies the
 * one property that actually matters most here: nobody authenticated can ever SELECT a
 * GSP secret back out, regardless of role, license, or permission -- there is no SELECT
 * grant or policy on either table at all, by design (ported from stockpilot-ai-ops's own
 * "no SELECT grant to authenticated" pattern).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner in her own business -- every permission
const BOB = "22222222-2222-2222-2222-222222222222"; // owner in a separate business
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business -- no settings.manage

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_credentials_rls_test",
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
        grant insert, update, delete on gst.eway_bill_credentials, gst.einvoice_credentials to authenticated;
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
      // Carol needs an account_members row (core.user_business_ids() resolves through
      // account membership) and a business_members row (has_permission()'s role lookup) --
      // same two-row setup test-inventory-procedural.mjs uses.
      psql(`
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${aliceBusiness}';
        insert into core.business_members (business_id, user_id, role) values
          ('${aliceBusiness}', '${ALICE}', 'owner'),
          ('${aliceBusiness}', '${CAROL}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
      `);

      const ewbInsert = (business) => `
        insert into gst.eway_bill_credentials (business_id, gsp_provider, auth_url, generate_url, cancel_url, encrypted_gsp_password)
        values ('${business}', 'ClearTax', 'https://gsp.example/auth', 'https://gsp.example/ewayapi', 'https://gsp.example/ewayapi/cancel', 's3cr3t')
      `;

      console.log("Verifying no gst license at all denies the write even for the owner...");
      assertThrows(
        () => psqlAsAlice(ewbInsert(aliceBusiness)),
        "with no gst license at all, Alice (owner) cannot save e-Way Bill credentials",
      );

      console.log("Activating a grace-period license and re-checking (write needs active, not grace)...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
        select account_id, id, 'gst', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';
      `);
      assertThrows(
        () => psqlAsAlice(ewbInsert(aliceBusiness)),
        "a grace-period gst license still denies writes (write_licensed_business_ids() is active-only)",
      );

      console.log("Activating the license: owner can write, viewer (no settings.manage) cannot...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'gst';`);
      assertThrows(
        () => psqlAsCarol(ewbInsert(aliceBusiness)),
        "Carol (viewer, no settings.manage) cannot save e-Way Bill credentials even with an active license",
      );
      psqlAsAlice(ewbInsert(aliceBusiness));
      psqlAsAlice(`
        insert into gst.einvoice_credentials (business_id, gsp_provider, auth_url, generate_url, cancel_url, encrypted_client_secret)
        values ('${aliceBusiness}', 'MasterGST', 'https://gsp.example/auth', 'https://gsp.example/einv', 'https://gsp.example/einv/cancel', 'topsecret');
      `);

      console.log("Verifying the status functions return non-secret fields only...");
      assertEqual(
        psqlAsAlice(`select gsp_provider from gst.eway_bill_credentials_status('${aliceBusiness}')`),
        "ClearTax",
        "the status function surfaces the provider name",
      );
      assertEqual(
        psqlAsAlice(`select gsp_provider from gst.einvoice_credentials_status('${aliceBusiness}')`),
        "MasterGST",
        "the status function surfaces the provider name for e-invoicing too",
      );

      console.log("Verifying NOBODY can SELECT the underlying secret columns directly, ever...");
      assertThrows(
        () => psqlAsAlice(`select encrypted_gsp_password from gst.eway_bill_credentials where business_id = '${aliceBusiness}'`),
        "even the licensed, permitted owner cannot SELECT the raw credentials table -- no grant, no policy",
      );
      assertThrows(
        () => psqlAsCarol(`select encrypted_client_secret from gst.einvoice_credentials where business_id = '${aliceBusiness}'`),
        "the viewer certainly cannot either",
      );

      console.log("Verifying tenant isolation: Bob's own licensed business can't see or touch Alice's...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id = '${bobBusiness}';
      `);
      assertThrows(
        () => psqlAsBob(`update gst.eway_bill_credentials set gsp_provider = 'Hacked' where business_id = '${aliceBusiness}'`),
        "Bob cannot update Alice's e-Way Bill credentials",
      );
      assertEqual(
        psqlAsBob(`select gsp_provider from gst.eway_bill_credentials_status('${aliceBusiness}')`),
        "",
        "Bob's status-function call for Alice's business returns no row (empty result), not her data",
      );
      psqlAsBob(ewbInsert(bobBusiness));
      assertEqual(
        psqlAsAlice(`select gsp_provider from gst.eway_bill_credentials_status('${bobBusiness}')`),
        "",
        "and Alice can't see Bob's status either",
      );

      console.log("All gst credentials RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
