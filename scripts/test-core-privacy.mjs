#!/usr/bin/env node
/**
 * DB test for the GDPR/DPDP primitives (20260908120000_core_privacy.sql +
 * 20260908121000_discovery_privacy_erasure.sql): append-only consent records, the
 * data-subject-request register (RLS, integrity, audit), hashed suppressions, third-party
 * erasure with tax-record restriction across core and discovery, and retention.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner (privacy.manage)
const BOB = "22222222-2222-2222-2222-222222222222"; // other tenant
const EVE = "55555555-5555-5555-5555-555555555555"; // viewer in Alice's business
const SUBJECT = "Jane.Doe@Example.com";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_privacy_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const alice = (sql) => psqlAs(ALICE, sql);
      const bob = (sql) => psqlAs(BOB, sql);
      const eve = (sql) => psqlAs(EVE, sql);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'), ('${EVE}', 'eve@example.com');
        grant usage on schema discovery to authenticated, service_role;
      `);
      const aliceAccount = psql(`select account_id from core.account_members where user_id = '${ALICE}'`);
      const business = psql(`insert into core.businesses (account_id, name) values ('${aliceAccount}', 'Alice Co') returning id;`);
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;
      `);
      psql(`
        insert into core.account_members (account_id, user_id, role) values ('${aliceAccount}', '${EVE}', 'member');
        insert into core.business_members (business_id, user_id, role) values
          ('${business}', '${ALICE}', 'owner'), ('${business}', '${EVE}', 'viewer'), ('${bobBusiness}', '${BOB}', 'owner');
      `);

      console.log("[0] email_hash normalization...");
      const hash = psql(`select core.email_hash('  ${SUBJECT} ')`);
      assertEqual(hash, psql(`select encode(sha256('jane.doe@example.com'::bytea), 'hex')`), "core.email_hash() trims and lowercases before hashing");
      assertEqual(psql(`select core.email_hash('alice@example.com')`), "ff8d9819fc0e12bf0d24892e45987e249a28dce836a85cad60e28eaaa8c6d976", "SQL and app-side hashes agree (same constant as privacy.test.ts)");

      console.log("[1] Consent records...");
      alice(`insert into core.consent_records (user_id, purpose, granted, notice_version, source) values ('${ALICE}', 'marketing_communications', true, 'v1', 'signup')`);
      alice(`insert into core.consent_records (user_id, purpose, granted, notice_version, source) values ('${ALICE}', 'marketing_communications', false, 'v1', 'settings')`);
      assertEqual(alice(`select granted from core.current_consents where purpose = 'marketing_communications'`), "f", "withdrawal is the latest record, so current consent is withdrawn");
      assertEqual(alice(`select count(*) from core.consent_records`), "2", "...and the full history is kept as evidence");
      assertThrows(() => alice(`insert into core.consent_records (user_id, purpose, granted, notice_version, source) values ('${BOB}', 'terms_privacy', true, 'v1', 'signup')`), "a user can't record consent for someone else");
      assertThrows(() => alice(`update core.consent_records set granted = true`), "consent records can't be edited");
      assertThrows(() => alice(`delete from core.consent_records`), "consent records can't be deleted by the user");
      assertEqual(bob(`select count(*) from core.consent_records`), "0", "users can't see each other's consents");

      console.log("[2] Data-subject request register...");
      alice(`insert into core.data_subject_requests (requester_user_id, subject_email, request_type, details) values ('${ALICE}', 'alice@example.com', 'correction', 'fix my name')`);
      assertEqual(alice(`select subject_email_hash = core.email_hash('alice@example.com') and due_at > now() + interval '29 days' from core.data_subject_requests`), "t", "the hash and a 30-day due date are set on filing");
      assertEqual(bob(`select count(*) from core.data_subject_requests`), "0", "other users can't see someone's own request");
      assertThrows(() => bob(`insert into core.data_subject_requests (requester_user_id, request_type) values ('${ALICE}', 'erasure')`), "nobody can file a request in another user's name");
      assertThrows(() => eve(`insert into core.data_subject_requests (business_id, subject_email, request_type) values ('${business}', 'x@y.com', 'erasure')`), "a viewer (no privacy.manage) can't log business requests");
      const request = alice(`insert into core.data_subject_requests (business_id, subject_email, request_type) values ('${business}', '${SUBJECT}', 'erasure') returning id`);
      assertEqual(eve(`select count(*) from core.data_subject_requests where business_id = '${business}'`), "0", "a viewer can't read the business's request register");
      assertEqual(bob(`select count(*) from core.data_subject_requests where business_id = '${business}'`), "0", "nor can another tenant");
      assertThrows(() => alice(`update core.data_subject_requests set request_type = 'access' where id = '${request}'`), "what was requested can't be changed after filing");
      assertThrows(() => alice(`update core.data_subject_requests set due_at = now() + interval '1 year' where id = '${request}'`), "the deadline can't be pushed back");
      assertThrows(() => alice(`delete from core.data_subject_requests where id = '${request}'`), "requests can't be deleted");
      assertEqual(alice(`select count(*) from core.audit_log where action = 'privacy.request_received' and entity_id = '${request}'`), "1", "logging a business request is audited");
      assertEqual(alice(`select after::text like '%@%' from core.audit_log where action = 'privacy.request_received'`), "f", "...without putting the address in the audit log");

      console.log("[3] Suppressions...");
      eve(`insert into core.communication_suppressions (business_id, email_hash, reason) values ('${business}', core.email_hash('optout@example.com'), 'unsubscribe')`);
      assertEqual(alice(`select core.is_email_suppressed('${business}', 'OptOut@Example.com')`), "t", "any member can honour an opt-out, and lookups are case-insensitive");
      assertEqual(bob(`select core.is_email_suppressed('${bobBusiness}', 'optout@example.com')`), "f", "a suppression is scoped to the business that received it");
      asService(`insert into core.communication_suppressions (business_id, email_hash, reason) values (null, core.email_hash('complainer@example.com'), 'complaint')`);
      assertEqual(bob(`select core.is_email_suppressed('${bobBusiness}', 'complainer@example.com')`), "t", "a platform-wide suppression applies to every business");
      assertThrows(() => bob(`select core.is_email_suppressed('${business}', 'optout@example.com')`), "a non-member can't probe another business's list");
      assertThrows(() => bob(`insert into core.communication_suppressions (business_id, email_hash, reason) values ('${business}', core.email_hash('x@y.com'), 'manual')`), "a non-member can't write another business's list");
      assertThrows(() => alice(`delete from core.communication_suppressions`), "suppressions can't be removed by clients");
      assertThrows(() => alice(`insert into core.communication_suppressions (business_id, email_hash, reason) values ('${business}', 'not-a-hash', 'manual')`), "only a real SHA-256 can be stored -- never a raw address");

      console.log("[4] Third-party erasure across core + discovery...");
      const plainParty = alice(`insert into core.parties (business_id, name, email, phone) values ('${business}', 'Jane Doe', '${SUBJECT}', '+911234') returning id`);
      alice(`
        insert into core.party_contacts (business_id, party_id, first_name, email) values ('${business}', '${plainParty}', 'Jane', 'jane.doe@example.com');
        insert into core.addresses (business_id, party_id, kind, formatted) values ('${business}', '${plainParty}', 'service', '1 Home St');
      `);
      const billedParty = alice(`insert into core.parties (business_id, name, email) values ('${business}', 'Jane Doe Consulting', 'JANE.DOE@example.com') returning id`);
      alice(`
        insert into core.addresses (business_id, party_id, kind, formatted) values
          ('${business}', '${billedParty}', 'billing', 'Billing Addr'), ('${business}', '${billedParty}', 'shipping', 'Ship Addr');
        insert into core.documents (business_id, doc_type, source_module, party_id, number) values ('${business}', 'invoice', 'fsm', '${billedParty}', 'INV/0001');
      `);
      const product = psql(`insert into discovery.products (business_id, name) values ('${business}', 'P') returning id`);
      const workspace = psql(`insert into discovery.workspaces (product_id) values ('${product}') returning id`);
      const prospect = psql(`insert into discovery.prospects (workspace_id, company_name, company_email) values ('${workspace}', 'Jane Co', 'jane.doe@example.com') returning id`);
      const contact = psql(`insert into discovery.contacts (workspace_id, prospect_id, first_name, email) values ('${workspace}', '${prospect}', 'Jane', '${SUBJECT}') returning id`);
      const otherContact = psql(`insert into discovery.contacts (workspace_id, prospect_id, first_name, email) values ('${workspace}', '${prospect}', 'Sam', 'sam@example.com') returning id`);
      psql(`
        insert into discovery.conversations (workspace_id, prospect_id, contact_id, channel) values ('${workspace}', '${prospect}', '${contact}', 'email');
        insert into discovery.messages (workspace_id, prospect_id, contact_id, channel, content) values
          ('${workspace}', '${prospect}', '${contact}', 'email', 'Hi Jane'),
          ('${workspace}', '${prospect}', '${otherContact}', 'email', 'Hi Sam');
      `);
      const bobParty = bob(`insert into core.parties (business_id, name, email) values ('${bobBusiness}', 'Jane at Bob', '${SUBJECT}') returning id`);

      assertThrows(() => eve(`select core.erase_subject_by_email('${business}', '${SUBJECT}')`), "a viewer can't erase");
      assertThrows(() => bob(`select core.erase_subject_by_email('${business}', '${SUBJECT}')`), "another tenant can't erase");
      const result = alice(`select core.erase_subject_by_email('${business}', '${SUBJECT}', '${request}')`);
      assertEqual(JSON.stringify(JSON.parse(result)), JSON.stringify({ parties_erased: 1, contacts_deleted: 1, parties_restricted: 1 }), "counts are reported");
      assertEqual(alice(`select name || '|' || coalesce(email, '-') || '|' || coalesce(phone, '-') || '|' || is_active from core.parties where id = '${plainParty}'`), "Erased contact|-|-|false", "a party with no financial records is anonymized");
      assertEqual(alice(`select count(*) from core.addresses where party_id = '${plainParty}'`), "0", "...and its addresses removed");
      assertEqual(alice(`select name || '|' || coalesce(email, '-') || '|' || is_active from core.parties where id = '${billedParty}'`), "Jane Doe Consulting|-|false", "a party on an invoice keeps its name (tax law) but loses contact details");
      assertEqual(alice(`select string_agg(kind, ',') from core.addresses where party_id = '${billedParty}'`), "billing", "...and keeps only its billing address");
      assertEqual(alice(`select number from core.documents where party_id = '${billedParty}'`), "INV/0001", "the invoice itself is untouched");
      assertEqual(bob(`select email from core.parties where id = '${bobParty}'`), SUBJECT, "the same person's record in another business is untouched");
      assertEqual(alice(`select core.is_email_suppressed('${business}', '${SUBJECT}')`), "t", "the address is suppressed for future email");
      assertEqual(alice(`select status || '|' || (response like 'Erased 1 contact%') from core.data_subject_requests where id = '${request}'`), "completed|true", "the linked request is completed with a summary");
      assertEqual(psql(`select payload->>'email_hash' = core.email_hash('${SUBJECT}') and payload::text not like '%@%' from core.domain_events where type = 'privacy.subject_erased'`), "t", "the module event carries only the hash");

      console.log("    discovery's own erasure (as its event handler runs it)...");
      assertThrows(() => alice(`select discovery.erase_subject_by_email_hash('${business}', '${hash}')`), "clients can't call discovery's erasure directly");
      assertEqual(asService(`select discovery.erase_subject_by_email_hash('${business}', '${hash}')`), "1", "one discovery contact erased");
      assertEqual(psql(`select count(*) from discovery.contacts where id = '${contact}'`), "0", "the contact is gone");
      assertEqual(psql(`select count(*) from discovery.messages where content = 'Hi Jane'`), "0", "outreach sent to them is gone (not just unlinked)");
      assertEqual(psql(`select count(*) from discovery.conversations where prospect_id = '${prospect}'`), "0", "their conversation is gone");
      assertEqual(psql(`select count(*) from discovery.messages where content = 'Hi Sam'`), "1", "other contacts' messages are untouched");
      assertEqual(psql(`select coalesce(company_email, '-') from discovery.prospects where id = '${prospect}'`), "-", "a prospect email that was theirs is cleared");
      assertThrows(() => asService(`select discovery.erase_subject_by_email_hash('${business}', 'jane@example.com')`), "a raw address is rejected -- only a hash is accepted");

      console.log("[5] Retention...");
      psql(`
        update core.domain_events set status = 'processed', processed_at = now() - interval '2 years';
        set session_replication_role = replica;
        update core.data_subject_requests set completed_at = now() - interval '40 days' where id = '${request}';
        insert into core.data_subject_requests (requester_user_id, request_type, status, completed_at, created_at)
          values (null, 'access', 'completed', now() - interval '4 years', now() - interval '4 years');
      `);
      const retention = JSON.parse(asService(`select core.run_retention()`));
      assertEqual(retention.domain_events, 1, "processed domain events older than a year are purged");
      assertEqual(retention.dsr_emails_minimized, 1, "the raw address on a closed request is dropped after 30 days");
      assertEqual(retention.dsr_deleted, 1, "requests closed over 3 years ago are deleted");
      assertEqual(alice(`select coalesce(subject_email, '-') || '|' || (subject_email_hash is not null) from core.data_subject_requests where id = '${request}'`), "-|true", "...keeping the hash as evidence");
      assertThrows(() => alice(`select core.run_retention()`), "only the service role can run retention");

      console.log("\nAll privacy checks passed.");
    },
  });
}

main();
