#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.threads/messages/message_templates
 * (Epic 6, story S-3; CLAUDE.md principle 9), via the shared harness (C-8).
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
    dbNamePrefix: "core_messages_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants with a job-shaped entity each...");
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
      const aliceJobId = "33333333-3333-3333-3333-333333333333";
      const bobJobId = "44444444-4444-4444-4444-444444444444";

      console.log("Verifying a thread can be created and re-found for the same entity...");
      const aliceThread = psqlAsAlice(
        `insert into core.threads (business_id, entity_type, entity_id, subject) values ('${aliceBusiness}', 'job', '${aliceJobId}', 'Job #JOB-0001') returning id;`,
      );
      assertEqual(
        psqlAsAlice(`select count(*) from core.threads where business_id = '${aliceBusiness}' and entity_type = 'job' and entity_id = '${aliceJobId}'`),
        "1",
        "exactly one thread exists for this entity",
      );

      console.log("Verifying inbound + outbound messages post onto the thread...");
      psqlAsAlice(
        `insert into core.messages (business_id, thread_id, direction, to_address, subject, body) values ('${aliceBusiness}', '${aliceThread}', 'outbound', 'customer@example.com', 'Your estimate', 'Please review your estimate.');`,
      );
      psqlAsAlice(
        `insert into core.messages (business_id, thread_id, direction, from_address, body) values ('${aliceBusiness}', '${aliceThread}', 'inbound', 'customer@example.com', 'Looks good, approved!');`,
      );
      assertEqual(psqlAsAlice(`select count(*) from core.messages where thread_id = '${aliceThread}'`), "2", "both messages landed on the thread");
      assertEqual(
        psqlAsAlice(`select direction from core.messages where thread_id = '${aliceThread}' and body = 'Looks good, approved!'`),
        "inbound",
        "the reply is recorded as inbound",
      );

      console.log("Verifying the direction/channel/status check constraints...");
      assertThrows(
        () => psqlAsAlice(`insert into core.messages (business_id, thread_id, direction, body) values ('${aliceBusiness}', '${aliceThread}', 'sideways', 'bad')`),
        "an invalid direction is rejected",
      );

      console.log("Verifying cross-tenant reference-smuggling on messages.thread_id...");
      assertThrows(
        () => psqlAsBob(`insert into core.messages (business_id, thread_id, direction, body) values ('${bobBusiness}', '${aliceThread}', 'outbound', 'smuggled')`),
        "Bob cannot post a message against Alice's thread while claiming it as his own business",
      );

      console.log("Verifying tenant isolation on threads/messages...");
      assertEqual(psqlAsBob("select count(*) from core.threads"), "0", "Bob sees none of Alice's threads");
      assertEqual(psqlAsBob("select count(*) from core.messages"), "0", "Bob sees none of Alice's messages");
      psqlAsBob(`insert into core.threads (business_id, entity_type, entity_id) values ('${bobBusiness}', 'job', '${bobJobId}');`);
      assertEqual(psqlAsAlice("select count(*) from core.threads where entity_id = '" + bobJobId + "'"), "0", "Alice still can't see Bob's thread");

      console.log("Verifying message templates (unique name per business) + tenant isolation...");
      psqlAsAlice(`insert into core.message_templates (business_id, name, subject, body) values ('${aliceBusiness}', 'Estimate follow-up', 'Following up', 'Just checking in on your estimate.');`);
      assertThrows(
        () => psqlAsAlice(`insert into core.message_templates (business_id, name, body) values ('${aliceBusiness}', 'Estimate follow-up', 'dup')`),
        "a duplicate template name for the same business is rejected",
      );
      psqlAsBob(`insert into core.message_templates (business_id, name, body) values ('${bobBusiness}', 'Estimate follow-up', 'Bob can reuse the same name in his own business');`);
      assertEqual(psqlAsBob("select count(*) from core.message_templates"), "1", "Bob sees only his own template");
      assertEqual(psqlAsAlice("select count(*) from core.message_templates"), "1", "Alice sees only her own template");

      console.log("\nAll core.threads/messages/message_templates RLS checks passed.");
    },
  });
}

main();
