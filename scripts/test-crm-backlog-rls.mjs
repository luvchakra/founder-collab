#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating test for CRM-01.2's new backlog schema
 * (20260911000000_crm_backlog_schema_baseline.sql) -- lead, opportunity,
 * opportunity_stage, channel_connection, conversation, conversation_participant,
 * interaction, activity, follow_up, crm_note, product_interest, review_item,
 * assignment. Mirrors test-crm-rls.mjs's own structure (same harness, same "tenant AND
 * licensed" pattern) but as its own file rather than folding into that one, since the
 * two schemas' tables are unrelated to each other (docs/design/crm-backlog-audit.md) and
 * a single 13-table test would be unwieldy.
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
    dbNamePrefix: "crm_backlog_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two licensed businesses...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema crm to authenticated;
        grant select, insert, update, delete on all tables in schema crm to authenticated;
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
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'crm', 'active' from core.businesses where id in ('${aliceBusiness}', '${bobBusiness}');
      `);
      const aliceParty = psqlAsAlice(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Alice Customer') returning id;`);
      const aliceEmployee = psqlAsAlice(`insert into core.employees (business_id, user_id) values ('${aliceBusiness}', '${ALICE}') returning id;`);
      const aliceItem = psqlAsAlice(`insert into core.items (business_id, name) values ('${aliceBusiness}', 'Widget') returning id;`);

      console.log("Verifying no crm license at all denies writes on a representative new table...");
      const unlicensedBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Unlicensed Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      assertThrows(
        () => psqlAsAlice(`insert into crm.lead (business_id, party_id) values ('${unlicensedBusiness}', '${aliceParty}')`),
        "with no crm license on that business, Alice cannot create a lead there",
      );

      console.log("Building a full lead -> opportunity -> conversation -> interaction chain...");
      const aliceStage = psqlAsAlice(`insert into crm.opportunity_stage (business_id, key, name) values ('${aliceBusiness}', 'new', 'New') returning id;`);
      const aliceLead = psqlAsAlice(`insert into crm.lead (business_id, party_id, owner_id) values ('${aliceBusiness}', '${aliceParty}', '${aliceEmployee}') returning id;`);
      assertEqual(psqlAsAlice(`select status from crm.lead where id = '${aliceLead}'`), "new", "a new lead defaults to status 'new'");

      console.log("Verifying CRM-03.1's promotion dedupe constraint...");
      const scratchPromotedLead1 = psqlAsAlice(`insert into crm.lead (business_id, party_id, source_module, source_reference) values ('${aliceBusiness}', '${aliceParty}', 'discovery', 'prospect-1') returning id;`);
      assertThrows(
        () => psqlAsAlice(`insert into crm.lead (business_id, party_id, source_module, source_reference) values ('${aliceBusiness}', '${aliceParty}', 'discovery', 'prospect-1')`),
        "a second lead for the same (business_id, source_module, source_reference) is rejected -- promoteProspectToLead() relies on this to never double-promote under a race",
      );
      const scratchPromotedLead2 = psqlAsAlice(`insert into crm.lead (business_id, party_id, source_module, source_reference) values ('${aliceBusiness}', '${aliceParty}', 'discovery', 'prospect-2') returning id;`);
      assertEqual(
        psqlAsAlice(`select count(*) from crm.lead where business_id = '${aliceBusiness}' and source_module = 'discovery'`),
        "2",
        "a different source_reference for the same source_module is a distinct, allowed lead",
      );
      psqlAsAlice(`delete from crm.lead where id in ('${scratchPromotedLead1}', '${scratchPromotedLead2}')`);

      const aliceOpportunity = psqlAsAlice(`
        insert into crm.opportunity (business_id, party_id, lead_id, stage_id, owner_id)
        values ('${aliceBusiness}', '${aliceParty}', '${aliceLead}', '${aliceStage}', '${aliceEmployee}')
        returning id;
      `);
      assertEqual(psqlAsAlice(`select status from crm.opportunity where id = '${aliceOpportunity}'`), "open", "a new opportunity defaults to status 'open'");

      const aliceConversation = psqlAsAlice(`
        insert into crm.conversation (business_id, party_id, primary_channel, lead_id, opportunity_id, assigned_to)
        values ('${aliceBusiness}', '${aliceParty}', 'whatsapp', '${aliceLead}', '${aliceOpportunity}', '${aliceEmployee}')
        returning id;
      `);
      assertEqual(psqlAsAlice(`select status from crm.conversation where id = '${aliceConversation}'`), "new", "a new conversation defaults to status 'new'");

      psqlAsAlice(`insert into crm.conversation_participant (business_id, conversation_id, party_id) values ('${aliceBusiness}', '${aliceConversation}', '${aliceParty}');`);

      const aliceInteraction = psqlAsAlice(`
        insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, external_message_id, requires_response)
        values ('${aliceBusiness}', '${aliceConversation}', '${aliceParty}', 'whatsapp', 'inbound', 'wamid.EXAMPLE1', true)
        returning id;
      `);
      assertEqual(psqlAsAlice(`select requires_response from crm.interaction where id = '${aliceInteraction}'`), "t", "an interaction can be flagged requires_response");

      const aliceActivity = psqlAsAlice(`
        insert into crm.activity (business_id, type, party_id, opportunity_id, owner_id)
        values ('${aliceBusiness}', 'call', '${aliceParty}', '${aliceOpportunity}', '${aliceEmployee}')
        returning id;
      `);
      psqlAsAlice(`insert into crm.follow_up (business_id, opportunity_id, activity_id, owner_id, due_at) values ('${aliceBusiness}', '${aliceOpportunity}', '${aliceActivity}', '${aliceEmployee}', now() + interval '1 day');`);
      psqlAsAlice(`insert into crm.crm_note (business_id, opportunity_id, author_id, body) values ('${aliceBusiness}', '${aliceOpportunity}', '${aliceEmployee}', 'Interested in the enterprise plan');`);
      psqlAsAlice(`insert into crm.product_interest (business_id, opportunity_id, item_id) values ('${aliceBusiness}', '${aliceOpportunity}', '${aliceItem}');`);

      const aliceChannelConnection = psqlAsAlice(`
        insert into crm.channel_connection (business_id, channel, provider, external_account_id)
        values ('${aliceBusiness}', 'whatsapp', 'whatsapp_business', 'wa-acct-1')
        returning id;
      `);
      psqlAsAlice(`insert into crm.review_item (business_id, channel_connection_id, provider, external_review_id, occurred_at) values ('${aliceBusiness}', '${aliceChannelConnection}', 'google_business_profile', 'review-1', now());`);
      psqlAsAlice(`insert into crm.assignment (business_id, entity_type, entity_id, owner_id) values ('${aliceBusiness}', 'lead', '${aliceLead}', '${aliceEmployee}');`);

      console.log("Verifying CRM-01.6's idempotency unique constraints...");
      assertThrows(
        () => psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction, external_message_id) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'inbound', 'wamid.EXAMPLE1')`),
        "a duplicate (business_id, channel, external_message_id) interaction is rejected",
      );
      psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'outbound');`);
      psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'outbound');`);
      assertEqual(psqlAsAlice(`select count(*) from crm.interaction where conversation_id = '${aliceConversation}' and external_message_id is null`), "2", "two interactions with no external_message_id at all are both allowed (partial unique index)");
      assertThrows(
        () => psqlAsAlice(`insert into crm.channel_connection (business_id, channel, provider, external_account_id) values ('${aliceBusiness}', 'whatsapp', 'whatsapp_business', 'wa-acct-1')`),
        "a duplicate (business_id, channel, provider, external_account_id) channel_connection is rejected",
      );
      assertThrows(
        () => psqlAsAlice(`insert into crm.review_item (business_id, channel_connection_id, provider, external_review_id, occurred_at) values ('${aliceBusiness}', '${aliceChannelConnection}', 'google_business_profile', 'review-1', now())`),
        "a duplicate (business_id, provider, external_review_id) review_item is rejected",
      );

      console.log("Verifying CRM-01.6's client_dedupe_key (outbound send-retry) idempotency...");
      const outboundAttempt = psqlAsAlice(`
        insert into crm.interaction (business_id, conversation_id, channel, direction, client_dedupe_key, status)
        values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'outbound', 'send-attempt-1', 'failed')
        returning id;
      `);
      assertThrows(
        () => psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction, client_dedupe_key) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'outbound', 'send-attempt-1')`),
        "a second insert under the same client_dedupe_key is rejected -- recordInteraction()'s retry path updates the existing row instead of inserting a new one",
      );
      psqlAsAlice(`update crm.interaction set status = 'received', content_excerpt = 'retried and sent' where id = '${outboundAttempt}'`);
      assertEqual(
        psqlAsAlice(`select status || '|' || content_excerpt from crm.interaction where id = '${outboundAttempt}'`),
        "received|retried and sent",
        "the same row can be updated in place once the retry succeeds, per recordInteraction()'s retryFailedInteraction() helper",
      );

      console.log("Verifying CRM-01.5's provider-neutral interaction model...");
      const emailConversation = psqlAsAlice(`insert into crm.conversation (business_id, party_id, primary_channel) values ('${aliceBusiness}', '${aliceParty}', 'email') returning id;`);
      const emailInteraction = psqlAsAlice(`
        insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, interaction_type, metadata)
        values ('${aliceBusiness}', '${emailConversation}', '${aliceParty}', 'email', 'inbound', 'message', '{"messageId": "<abc@mail>", "subject": "Pricing question"}')
        returning id;
      `);
      const instagramConversation = psqlAsAlice(`insert into crm.conversation (business_id, party_id, primary_channel) values ('${aliceBusiness}', '${aliceParty}', 'instagram') returning id;`);
      const instagramInteraction = psqlAsAlice(`
        insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, interaction_type, metadata)
        values ('${aliceBusiness}', '${instagramConversation}', '${aliceParty}', 'instagram', 'inbound', 'comment', '{"mediaId": "ig-media-1", "commentId": "ig-comment-1"}')
        returning id;
      `);
      assertEqual(
        psqlAsAlice(`select count(*) from crm.interaction where id in ('${emailInteraction}', '${instagramInteraction}')`),
        "2",
        "email and Instagram interactions both fit the one generic crm.interaction table -- no per-channel table needed",
      );
      assertEqual(
        psqlAsAlice(`select metadata ->> 'subject' from crm.interaction where id = '${emailInteraction}'`),
        "Pricing question",
        "channel-specific detail (email subject) lives in metadata, not a dedicated column",
      );
      assertEqual(
        psqlAsAlice(`select metadata ->> 'commentId' from crm.interaction where id = '${instagramInteraction}'`),
        "ig-comment-1",
        "a different channel's own specific detail (Instagram comment id) lives in metadata too, same generic column",
      );
      assertEqual(
        psqlAsAlice(`select requires_response from crm.interaction where id = '${emailInteraction}'`),
        "f",
        "requires_response defaults to false when not explicitly set",
      );

      console.log("Verifying tenant isolation between two licensed businesses...");
      const bobParty = psqlAsBob(`insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bob Customer') returning id;`);
      psqlAsBob(`insert into crm.lead (business_id, party_id) values ('${bobBusiness}', '${bobParty}');`);
      assertEqual(psqlAsBob("select count(*) from crm.lead"), "1", "Bob sees only his own lead");
      assertEqual(psqlAsAlice("select count(*) from crm.lead"), "1", "Alice still sees only her own lead");
      assertEqual(psqlAsBob("select count(*) from crm.opportunity"), "0", "Bob sees none of Alice's opportunities");
      assertEqual(psqlAsBob("select count(*) from crm.conversation"), "0", "Bob sees none of Alice's conversations");
      assertEqual(psqlAsBob("select count(*) from crm.interaction"), "0", "Bob sees none of Alice's interactions");

      console.log("Verifying cross-tenant reference-smuggling triggers...");
      assertThrows(
        () => psqlAsBob(`insert into crm.lead (business_id, party_id) values ('${bobBusiness}', '${aliceParty}')`),
        "Bob cannot create a lead against Alice's party",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.opportunity (business_id, party_id, lead_id) values ('${bobBusiness}', '${bobParty}', '${aliceLead}')`),
        "Bob cannot create an opportunity against Alice's lead",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.conversation (business_id, primary_channel, opportunity_id) values ('${bobBusiness}', 'whatsapp', '${aliceOpportunity}')`),
        "Bob cannot create a conversation against Alice's opportunity",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.interaction (business_id, conversation_id, channel, direction) values ('${bobBusiness}', '${aliceConversation}', 'whatsapp', 'inbound')`),
        "Bob cannot create an interaction against Alice's conversation",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.activity (business_id, type, party_id) values ('${bobBusiness}', 'call', '${aliceParty}')`),
        "Bob cannot create an activity against Alice's party",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.product_interest (business_id, item_id) values ('${bobBusiness}', '${aliceItem}')`),
        "Bob cannot associate product interest with Alice's item",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.assignment (business_id, entity_type, entity_id, owner_id) values ('${bobBusiness}', 'lead', '${aliceLead}', '${aliceEmployee}')`),
        "Bob cannot create an assignment owned by Alice's employee",
      );

      console.log("\nAll crm backlog-schema RLS checks passed.");
    },
  });
}

main();
