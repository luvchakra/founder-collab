#!/usr/bin/env node
/**
 * DB test for AI reply drafts (PLATFORM-P1-12.1 / 12.2 / 12.4, migration 20261014120000):
 *   - crm.reply_drafts is tenant AND licensed: another business can't read or write a draft,
 *     an unlicensed business can't write one, and a draft can't point at another business's
 *     message even with a forged business_id;
 *   - one draft per message; an answered draft needs its text, a not-answerable one has none;
 *   - core.businesses' new contact details are validated.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-9999999999a1";
const BOB = "99999999-9999-9999-9999-9999999999a2";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "crm_reply_drafts_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-drafts@example.com'), ('${BOB}', 'bob-drafts@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema crm to authenticated;
        grant select, insert, update, delete on all tables in schema crm to authenticated;
      `);
      const business = (user, name) =>
        psql(`insert into core.businesses (account_id, name) select account_id, '${name}' from core.account_members where user_id = '${user}' returning id;`);
      const alice = business(ALICE, "Alice Co");
      const bob = business(BOB, "Bob Co");
      const unlicensed = business(ALICE, "Alice Unlicensed");
      psql(`insert into core.licenses (account_id, business_id, module_key, status) select account_id, id, 'crm', 'active' from core.businesses where id in ('${alice}', '${bob}');`);

      const inbound = (user, biz, wamid) => {
        const party = psqlAs(user, `insert into core.parties (business_id, name) values ('${biz}', 'Customer') returning id;`);
        const conversation = psqlAs(user, `insert into crm.conversation (business_id, party_id, primary_channel) values ('${biz}', '${party}', 'whatsapp') returning id;`);
        return psqlAs(user, `insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, external_message_id, content_excerpt) values ('${biz}', '${conversation}', '${party}', 'whatsapp', 'inbound', '${wamid}', 'What are your hours?') returning id;`);
      };
      const aliceMessage = inbound(ALICE, alice, "wamid.A1");
      const bobMessage = inbound(BOB, bob, "wamid.B1");

      const draft = (biz, interaction, extra = "") =>
        `insert into crm.reply_drafts (business_id, interaction_id, status, answer, topic, facts_used, input_hash, prompt_version) values ('${biz}', '${interaction}', ${extra || "'answered', 'Open 10 to 7.', 'hours_location_contact', '[{\"id\":\"business.hours\",\"label\":\"Opening hours\"}]'"}, 'h1', 'draft_customer_reply_v1')`;

      console.log("Verifying the owning business can store and read its draft...");
      psqlAs(ALICE, draft(alice, aliceMessage));
      assertEqual(psqlAs(ALICE, `select answer from crm.reply_drafts where interaction_id = '${aliceMessage}'`), "Open 10 to 7.", "the draft is stored");
      assertThrows(() => psqlAs(ALICE, draft(alice, aliceMessage)), "one draft per message");

      console.log("Verifying tenant isolation...");
      assertEqual(psqlAs(BOB, `select count(*) from crm.reply_drafts where interaction_id = '${aliceMessage}'`), "0", "Bob can't see Alice's draft");
      assertThrows(() => psqlAs(BOB, draft(alice, aliceMessage)), "Bob can't write into Alice's business");
      assertThrows(() => psqlAs(BOB, draft(bob, aliceMessage)), "a draft can't point at another business's message with a forged business_id");
      assertEqual(psqlAs(BOB, `update crm.reply_drafts set answer = 'hacked' where interaction_id = '${aliceMessage}' returning 1`), "", "Bob's update matches nothing");

      console.log("Verifying licence gating...");
      const unlicensedMessage = psql(`
        with p as (insert into core.parties (business_id, name) values ('${unlicensed}', 'C') returning id),
             c as (insert into crm.conversation (business_id, party_id, primary_channel) select '${unlicensed}', id, 'whatsapp' from p returning id, party_id)
        insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, external_message_id) select '${unlicensed}', id, party_id, 'whatsapp', 'inbound', 'wamid.U1' from c returning id;`);
      assertThrows(() => psqlAs(ALICE, draft(unlicensed, unlicensedMessage)), "no CRM licence, no draft");

      console.log("Verifying draft shape...");
      assertThrows(() => psqlAs(BOB, draft(bob, bobMessage, "'answered', null, 'other', '[]'")), "an answered draft needs its text");
      assertThrows(() => psqlAs(BOB, draft(bob, bobMessage, "'not_answerable', 'something', 'needs_person', '[]'")), "a not-answerable draft has no text");
      psqlAs(BOB, draft(bob, bobMessage, "'not_answerable', null, 'needs_person', '[]'"));

      console.log("Verifying contact details...");
      psqlAs(ALICE, `update core.businesses set opening_hours = 'Mon-Sat 10-7', contact_email = 'hi@alice.example' where id = '${alice}'`);
      assertThrows(() => psqlAs(ALICE, `update core.businesses set contact_email = 'not-an-email' where id = '${alice}'`), "a malformed email is refused");
      assertEqual(psqlAs(BOB, `select count(*) from core.businesses where id = '${alice}'`), "0", "Bob can't read Alice's contact details");

      console.log("\nAll reply draft checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
