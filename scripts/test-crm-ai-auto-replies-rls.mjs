#!/usr/bin/env node
/**
 * DB test for automatic WhatsApp AI replies (PLATFORM-P1-12.5/12.6, migration
 * 20261017110000_crm_whatsapp_ai_auto_replies.sql):
 *   - crm.channel_connection.ai_reply_mode defaults to 'draft' and only a member with
 *     channel_connections.manage can change it;
 *   - crm.ai_auto_replies is tenant AND licensed for reading, and nobody but the service role
 *     writes it;
 *   - crm.claim_ai_auto_reply(): one claim per inbound message (a redelivery gets the same row
 *     back), 100 per business and 3 per conversation per business day, no active CRM licence
 *     means skipped, and a message can't be claimed under another business;
 *   - outcomes are final; claims and outcomes land in core.audit_log;
 *   - WhatsApp opt-outs live in core.communication_suppressions as a namespaced hash.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-9999999999b1";
const BOB = "99999999-9999-9999-9999-9999999999b2";
const CAROL = "99999999-9999-9999-9999-9999999999b3"; // sales_manager in Alice's business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "crm_ai_auto_replies_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asService = (sql) => psql(`set local role service_role; ${sql}`);
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-auto@example.com'), ('${BOB}', 'bob-auto@example.com'), ('${CAROL}', 'carol-auto@example.com');
        grant usage on schema core to authenticated;
        grant usage on schema crm to authenticated;
      `);
      const business = (user, name) =>
        psql(`insert into core.businesses (account_id, name) select account_id, '${name}' from core.account_members where user_id = '${user}' returning id;`);
      const alice = business(ALICE, "Alice Co");
      const bob = business(BOB, "Bob Co");
      const unlicensed = business(ALICE, "Alice Unlicensed");
      psql(`
        insert into core.business_members (business_id, user_id, role) values
          ('${alice}', '${ALICE}', 'owner'), ('${alice}', '${CAROL}', 'sales_manager'), ('${bob}', '${BOB}', 'owner'), ('${unlicensed}', '${ALICE}', 'owner')
          on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status) select account_id, id, 'crm', 'active' from core.businesses where id in ('${alice}', '${bob}');
      `);
      const connection = (biz, phoneId) =>
        psql(`insert into crm.channel_connection (business_id, channel, provider, external_account_id) values ('${biz}', 'whatsapp', 'whatsapp_cloud_api', '${phoneId}') returning id;`);
      const aliceConnection = connection(alice, "pn-alice");
      connection(bob, "pn-bob");

      const conversation = (biz) => psql(`insert into crm.conversation (business_id, primary_channel) values ('${biz}', 'whatsapp') returning id;`);
      let n = 0;
      const inbound = (biz, conv) =>
        psql(`insert into crm.interaction (business_id, conversation_id, channel, direction, external_actor_id, external_message_id, content_excerpt)
              values ('${biz}', '${conv}', 'whatsapp', 'inbound', '919800000001', 'wamid.${++n}', 'What are your hours?') returning id;`);
      const claim = (biz, interaction, skip = "null") =>
        asService(`select status || ':' || coalesce(reason, '-') || ':' || created from crm.claim_ai_auto_reply('${biz}', '${interaction}', ${skip});`);

      console.log("[1] The mode...");
      assertEqual(psql(`select ai_reply_mode from crm.channel_connection where id = '${aliceConnection}'`), "draft", "Draft for review is the default");
      assertThrows(() => psqlAs(CAROL, `update crm.channel_connection set ai_reply_mode = 'auto' where id = '${aliceConnection}'`), "a member without channel_connections.manage can't turn on Send automatically");
      psqlAs(ALICE, `update crm.channel_connection set ai_reply_mode = 'auto' where id = '${aliceConnection}'`);
      assertEqual(psql(`select ai_reply_mode from crm.channel_connection where id = '${aliceConnection}'`), "auto", "the owner can");
      assertEqual(psqlAs(BOB, `update crm.channel_connection set ai_reply_mode = 'draft' where id = '${aliceConnection}' returning 1`), "", "another business's owner matches nothing");
      assertThrows(() => psqlAs(ALICE, `update crm.channel_connection set ai_reply_mode = 'always' where id = '${aliceConnection}'`), "only the two modes exist");

      console.log("[2] One claim per message...");
      const aliceConv = conversation(alice);
      const m1 = inbound(alice, aliceConv);
      assertEqual(claim(alice, m1), "requested:-:true", "the first delivery claims the message");
      assertEqual(claim(alice, m1), "requested:-:false", "a redelivery gets the same claim back, not a second one");
      assertEqual(psql(`select count(*) from crm.ai_auto_replies where interaction_id = '${m1}'`), "1", "still one row");
      assertThrows(() => asService(`insert into crm.ai_auto_replies (business_id, conversation_id, interaction_id, status, local_day) values ('${alice}', '${aliceConv}', '${m1}', 'requested', current_date)`), "the unique constraint backs it up");

      console.log("[3] Outcomes are final and audited...");
      asService(`update crm.ai_auto_replies set status = 'sent', answer = 'Open 10 to 7.' where interaction_id = '${m1}'`);
      assertThrows(() => asService(`update crm.ai_auto_replies set status = 'failed', reason = 'send_failed' where interaction_id = '${m1}'`), "a sent reply can't be re-marked");
      assertThrows(() => asService(`update crm.ai_auto_replies set status = 'requested' where interaction_id = '${m1}'`), "...or reopened for a second send");
      assertEqual(
        psql(`select string_agg(action, ',' order by created_at, action) from core.audit_log where entity_type = 'crm_ai_auto_reply'`),
        "crm_ai_auto_reply.requested,crm_ai_auto_reply.sent",
        "the claim and the send are in the audit log",
      );

      console.log("[4] Per-conversation limit (3 a day)...");
      const m2 = inbound(alice, aliceConv);
      const m3 = inbound(alice, aliceConv);
      const m4 = inbound(alice, aliceConv);
      assertEqual(claim(alice, m2), "requested:-:true", "second reply in the conversation");
      asService(`update crm.ai_auto_replies set status = 'skipped', reason = 'low_confidence' where interaction_id = '${m2}'`);
      assertEqual(claim(alice, m3), "requested:-:true", "a skipped claim doesn't count, so this is the second counted");
      assertEqual(claim(alice, m4), "requested:-:true", "third counted (m1 sent, m3, m4 requested)");
      const m5 = inbound(alice, aliceConv);
      assertEqual(claim(alice, m5), "skipped:conversation_limit:true", "the fourth in a day is refused");

      console.log("[5] Business limit (100 a day)...");
      psql(`
        do $$
        declare c uuid; i uuid;
        begin
          for g in 1..97 loop
            insert into crm.conversation (business_id, primary_channel) values ('${alice}', 'whatsapp') returning id into c;
            insert into crm.interaction (business_id, conversation_id, channel, direction, external_message_id)
              values ('${alice}', c, 'whatsapp', 'inbound', 'wamid.bulk.' || g) returning id into i;
            insert into crm.ai_auto_replies (business_id, conversation_id, interaction_id, status, local_day)
              values ('${alice}', c, i, 'sent', (now() at time zone coalesce((select timezone from core.business_settings where business_id = '${alice}'), 'UTC'))::date);
          end loop;
        end $$;
      `);
      assertEqual(psql(`select count(*) from crm.ai_auto_replies where business_id = '${alice}' and status in ('requested', 'sent')`), "100", "100 counted today");
      const freshConv = conversation(alice);
      const m6 = inbound(alice, freshConv);
      assertEqual(claim(alice, m6), "skipped:daily_limit:true", "the 101st of the day is refused, in a fresh conversation too");
      const bobConv = conversation(bob);
      const b1 = inbound(bob, bobConv);
      assertEqual(claim(bob, b1), "requested:-:true", "another business's limit is its own");

      console.log("[6] Licence and tenancy...");
      const uConv = conversation(unlicensed);
      const u1 = inbound(unlicensed, uConv);
      assertEqual(claim(unlicensed, u1), "skipped:not_licensed:true", "no active CRM licence, no automatic reply");
      const b2 = inbound(bob, bobConv);
      assertThrows(() => claim(alice, b2), "a message can't be claimed under another business");
      assertThrows(() => claim(bob, m1), "...even one that's already claimed");
      assertEqual(psqlAs(BOB, `select count(*) from crm.ai_auto_replies where business_id = '${alice}'`), "0", "Bob can't read Alice's automatic replies");
      assertEqual(psqlAs(ALICE, `select count(*) from crm.ai_auto_replies where interaction_id = '${m1}'`), "1", "Alice can read her own");
      assertEqual(psqlAs(ALICE, `select count(*) from crm.ai_auto_replies where business_id = '${unlicensed}'`), "0", "...but not in her unlicensed business");
      assertThrows(() => psqlAs(ALICE, `insert into crm.ai_auto_replies (business_id, conversation_id, interaction_id, status, local_day) values ('${alice}', '${freshConv}', '${inbound(alice, freshConv)}', 'requested', current_date)`), "a member can't write a claim");
      assertThrows(() => psqlAs(ALICE, `update crm.ai_auto_replies set status = 'sent' where interaction_id = '${m3}'`), "...or change one");
      assertThrows(() => psqlAs(ALICE, `select crm.claim_ai_auto_reply('${alice}', '${m3}', null)`), "...or call the claim function");
      assertThrows(() => asService(`insert into crm.ai_auto_replies (business_id, conversation_id, interaction_id, status, local_day) values ('${bob}', '${bobConv}', '${m3}', 'requested', current_date)`), "a claim can't point at another business's message");

      console.log("[7] Skip reasons are recorded...");
      const b3 = inbound(bob, bobConv);
      assertEqual(claim(bob, b3, "'opted_out'"), "skipped:opted_out:true", "a reason the caller already knows is stored as skipped");
      assertThrows(() => claim(bob, inbound(bob, bobConv), "'made_up'"), "only known reasons");

      console.log("[8] WhatsApp opt-outs...");
      const appHash = createHash("sha256").update("whatsapp:919800000001").digest("hex");
      assertEqual(psql(`select core.whatsapp_contact_hash('+91 98000 00001')`), appHash, "the SQL hash matches whatsAppContactHash() in TypeScript");
      asService(`insert into core.communication_suppressions (business_id, channel, email_hash, reason) values ('${alice}', 'whatsapp', core.whatsapp_contact_hash('919800000001'), 'unsubscribe')`);
      assertEqual(psql(`select channel from core.communication_suppressions where business_id = '${alice}'`), "whatsapp", "stored under the whatsapp channel");
      assertEqual(psqlAs(BOB, `select count(*) from core.communication_suppressions where business_id = '${alice}'`), "0", "another business can't see it");
      assertThrows(() => asService(`insert into core.communication_suppressions (business_id, channel, email_hash, reason) values ('${alice}', 'sms', core.whatsapp_contact_hash('1'), 'unsubscribe')`), "only known channels");

      console.log("\nAll automatic reply checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
