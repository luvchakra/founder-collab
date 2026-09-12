#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for
 * `gst.exemption_certificates` (COMPLY-P1-02.6), plus the invariants that matter most for
 * this table: both confused-deputy guards (party_id and attachment_id), the
 * expires_at >= issued_date check, the status enum, revoke-not-delete, and attaching a
 * scan after the fact.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no gst.manage_exemption_certificates

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_exemption_certificates_rls_test",
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
        grant select, insert, update on gst.exemption_certificates to authenticated;
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

      const aliceCustomer = psql(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Acme Retail') returning id;`);
      const bobCustomer = psql(`insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bob Customer') returning id;`);
      const aliceAttachment = psqlAsAlice(`
        insert into core.attachments (business_id, entity_type, entity_id, storage_path, file_name)
        values ('${aliceBusiness}', 'exemption_certificate', '${aliceCustomer}', 'certs/acme.pdf', 'acme-resale.pdf')
        returning id;
      `);
      const bobAttachment = psqlAsBob(`
        insert into core.attachments (business_id, entity_type, entity_id, storage_path, file_name)
        values ('${bobBusiness}', 'exemption_certificate', '${bobCustomer}', 'certs/bob.pdf', 'bob-resale.pdf')
        returning id;
      `);

      const recordCert = (business, party, opts = {}) => `
        insert into gst.exemption_certificates (business_id, party_id, jurisdiction, certificate_type, certificate_number, issued_date, expires_at, attachment_id)
        values ('${business}', '${party}', ${opts.jurisdiction ? `'${opts.jurisdiction}'` : "null"}, '${opts.type ?? "resale"}', '${opts.number ?? "CERT-1"}', '${opts.issued ?? "2024-01-01"}', ${opts.expires ? `'${opts.expires}'` : "null"}, ${opts.attachment ? `'${opts.attachment}'` : "null"})
        returning id
      `;

      console.log("Carol (viewer, no gst.manage_exemption_certificates) cannot record a certificate...");
      assertThrows(
        () => psqlAsCarol(recordCert(aliceBusiness, aliceCustomer)),
        "Carol lacks gst.manage_exemption_certificates",
      );

      console.log("Alice (owner) can record a certificate for her own customer...");
      const cert = psqlAsAlice(recordCert(aliceBusiness, aliceCustomer, { jurisdiction: "CA", attachment: aliceAttachment }));
      assertEqual(
        psqlAsAlice(`select status from gst.exemption_certificates where id = '${cert}'`),
        "active",
        "the certificate defaults to active",
      );

      console.log("Confused-deputy guard (party_id): Alice cannot point party_id at Bob's own customer while claiming business_id = Alice's...");
      assertThrows(
        () => psqlAsAlice(recordCert(aliceBusiness, bobCustomer, { number: "CERT-2" })),
        "party_id does not belong to business_id",
      );

      console.log("Confused-deputy guard (attachment_id): Alice cannot point attachment_id at Bob's own attachment...");
      assertThrows(
        () => psqlAsAlice(recordCert(aliceBusiness, aliceCustomer, { number: "CERT-3", attachment: bobAttachment })),
        "attachment_id does not belong to business_id",
      );

      console.log("expires_at before issued_date is rejected by the check constraint...");
      assertThrows(
        () => psqlAsAlice(recordCert(aliceBusiness, aliceCustomer, { number: "CERT-4", issued: "2024-06-01", expires: "2024-01-01" })),
        "expires_at >= issued_date check constraint",
      );

      console.log("An unrecognized status is rejected by the check constraint (via a direct update)...");
      assertThrows(
        () => psqlAsAlice(`update gst.exemption_certificates set status = 'pending' where id = '${cert}'`),
        "status check constraint",
      );

      console.log("A malformed jurisdiction is rejected by the check constraint...");
      assertThrows(
        () => psqlAsAlice(recordCert(aliceBusiness, aliceCustomer, { number: "CERT-5", jurisdiction: "California" })),
        "jurisdiction ~ '^[A-Z]{2}$' check constraint",
      );

      console.log("Alice can attach a scan after the fact to a certificate recorded without one...");
      const certNoScan = psqlAsAlice(recordCert(aliceBusiness, aliceCustomer, { number: "CERT-6" }));
      psqlAsAlice(`update gst.exemption_certificates set attachment_id = '${aliceAttachment}' where id = '${certNoScan}'`);
      assertEqual(
        psqlAsAlice(`select attachment_id from gst.exemption_certificates where id = '${certNoScan}'`),
        aliceAttachment,
        "the scan was attached",
      );

      console.log("Alice can revoke a certificate (status update, never a delete)...");
      psqlAsAlice(`update gst.exemption_certificates set status = 'revoked' where id = '${cert}'`);
      assertEqual(
        psqlAsAlice(`select status from gst.exemption_certificates where id = '${cert}'`),
        "revoked",
        "the certificate is now revoked, still on file",
      );

      console.log("Nobody can delete a certificate (no delete policy -- preserve historical evidence)...");
      assertThrows(
        () => psqlAsAlice(`delete from gst.exemption_certificates where id = '${cert}'`),
        "no delete policy exists on gst.exemption_certificates",
      );

      console.log("Carol (viewer) can read certificates but cannot effectively update them (RLS's own USING clause hides the row from her write, matching COMPLY-P0-07.5's own documented cross-tenant-UPDATE non-throwing shape)...");
      assertEqual(
        psqlAsCarol(`select count(*)::int from gst.exemption_certificates where business_id = '${aliceBusiness}'`),
        "2",
        "read-only members can see the business's own certificates",
      );
      psqlAsCarol(`update gst.exemption_certificates set status = 'revoked' where id = '${certNoScan}'`);
      assertEqual(
        psqlAsAlice(`select status from gst.exemption_certificates where id = '${certNoScan}'`),
        "active",
        "Carol's update silently matched zero rows -- the certificate is unchanged",
      );

      console.log("Tenant isolation: Bob cannot see or touch Alice's certificates...");
      assertEqual(
        psqlAsBob(`select count(*)::int from gst.exemption_certificates where business_id = '${aliceBusiness}'`),
        "0",
        "Bob's RLS-scoped read of Alice's business returns nothing",
      );
      assertThrows(
        () => psqlAsBob(recordCert(aliceBusiness, aliceCustomer, { number: "CERT-7" })),
        "Bob cannot record a certificate against Alice's business_id",
      );

      console.log("All gst.exemption_certificates RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
