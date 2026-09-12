#!/usr/bin/env node
/**
 * Behavior + RLS test for core.audit_log + core.write_audit_log() (Epic 3, story D-10),
 * via the shared harness (C-8). Covers the two real triggers wired up (document status
 * changes, business_settings changes), that only an actual field change logs anything,
 * tenant isolation, and that no client-facing write policy exists.
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
    dbNamePrefix: "core_audit_log_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants with a party, item and document each...");
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
      const aliceParty = psqlAsAlice(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Acme Inc') returning id;`);
      // source_module is deliberately NOT 'inventory' -- SP-3b added a status-transition
      // permission trigger scoped to source_module='inventory' rows only, and this test is
      // about the generic document status-change audit trigger, not inventory's permission
      // model, so it uses a source_module that trigger explicitly passes through untouched.
      const aliceDoc = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, party_id)
        values ('${aliceBusiness}', 'sales_order', 'fsm', '${aliceParty}') returning id;
      `);

      console.log("Verifying the write helper directly...");
      const entryId = psql(`select core.write_audit_log('${aliceBusiness}', '${ALICE}', 'manual.test', 'thing', null, null, '{"note": "hi"}')`);
      assertEqual(psqlAsAlice(`select action from core.audit_log where id = '${entryId}'`), "manual.test", "a direct write_audit_log() call lands a readable row");

      console.log("Verifying the document status-change trigger...");
      assertEqual(psqlAsAlice(`select count(*) from core.audit_log where entity_type = 'document'`), "0", "no status-change entry yet -- status hasn't changed");
      psqlAsAlice(`update core.documents set status = 'confirmed' where id = '${aliceDoc}'`);
      assertEqual(psqlAsAlice(`select count(*) from core.audit_log where entity_type = 'document' and entity_id = '${aliceDoc}'`), "1", "changing status logs exactly one entry");
      assertEqual(psqlAsAlice(`select action from core.audit_log where entity_type = 'document' and entity_id = '${aliceDoc}'`), "document.status_changed", "the action name matches");
      assertEqual(psqlAsAlice(`select before->>'status' from core.audit_log where entity_type = 'document' and entity_id = '${aliceDoc}'`), "draft", "before captures the old status");
      assertEqual(psqlAsAlice(`select after->>'status' from core.audit_log where entity_type = 'document' and entity_id = '${aliceDoc}'`), "confirmed", "after captures the new status");

      console.log("Verifying an unrelated document update does NOT log a status-change entry...");
      psqlAsAlice(`update core.documents set notes = 'just a note' where id = '${aliceDoc}'`);
      assertEqual(psqlAsAlice(`select count(*) from core.audit_log where entity_type = 'document' and entity_id = '${aliceDoc}'`), "1", "updating an unrelated column doesn't add another entry");

      console.log("Verifying the business_settings change trigger...");
      // core.handle_new_business() (PLATFORM-P0-05.2's own plan-link migration) already
      // created this row the moment core.businesses was inserted above -- no insert
      // needed (and a plain one would now fail on the business_id primary key).
      psqlAsAlice(`update core.business_settings set gstin = '27ALICE0001Z5' where business_id = '${aliceBusiness}';`);
      assertEqual(psqlAsAlice(`select count(*) from core.audit_log where entity_type = 'business_settings'`), "1", "setting a GSTIN for the first time logs one entry");
      psqlAsAlice(`update core.business_settings set slug = 'alice-co' where business_id = '${aliceBusiness}';`);
      assertEqual(psqlAsAlice(`select count(*) from core.audit_log where entity_type = 'business_settings'`), "1", "changing slug (not a tracked field) doesn't add another entry");

      console.log("Verifying tenant isolation...");
      assertEqual(psqlAsBob("select count(*) from core.audit_log"), "0", "Bob sees none of Alice's audit log entries");
      assertEqual(psqlAsAlice("select count(*) from core.audit_log"), "3", "Alice sees all three of her own entries (manual write + status change + settings change)");

      console.log("Verifying there is no client-facing write policy...");
      assertThrows(
        () => psqlAsAlice(`insert into core.audit_log (business_id, action, entity_type) values ('${aliceBusiness}', 'sneaky', 'thing')`),
        "a member cannot insert an audit_log row directly, only through write_audit_log()",
      );

      console.log("\nAll core.audit_log checks passed.");
    },
  });
}

main();
