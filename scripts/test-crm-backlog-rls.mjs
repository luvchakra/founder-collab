#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating test for CRM-01.2's new backlog schema
 * (20260911000000_crm_backlog_schema_baseline.sql) -- lead, opportunity,
 * opportunity_stage, channel_connection, conversation, conversation_participant,
 * interaction, activity, follow_up, crm_note, product_interest, review_item,
 * assignment -- plus CRM-04.5's opportunity_contact
 * (20260911000500_crm_opportunity_contacts.sql) and CRM-05.2's lead/opportunity
 * next_action_id (20260911000600_crm_next_action.sql). Mirrors test-crm-rls.mjs's own
 * structure (same harness, same "tenant AND licensed" pattern) but as its own file
 * rather than folding into that one, since the two schemas' tables are unrelated to each
 * other (docs/design/crm-backlog-audit.md) and a single many-table test would be
 * unwieldy.
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

      console.log("Verifying CRM-03.4's convert-to-opportunity backfill (product interest and activity history remain attached)...");
      const scratchLeadOnlyActivity = psqlAsAlice(`insert into crm.activity (business_id, type, lead_id, owner_id) values ('${aliceBusiness}', 'call', '${aliceLead}', '${aliceEmployee}') returning id;`);
      const scratchLeadOnlyProductInterest = psqlAsAlice(`insert into crm.product_interest (business_id, lead_id, item_id) values ('${aliceBusiness}', '${aliceLead}', '${aliceItem}') returning id;`);
      // convertLeadToOpportunity()'s own backfill: opportunity_id set wherever lead_id
      // matches and opportunity_id is still null -- exactly what the app code runs.
      psqlAsAlice(`update crm.activity set opportunity_id = '${aliceOpportunity}' where business_id = '${aliceBusiness}' and lead_id = '${aliceLead}' and opportunity_id is null`);
      psqlAsAlice(`update crm.product_interest set opportunity_id = '${aliceOpportunity}' where business_id = '${aliceBusiness}' and lead_id = '${aliceLead}' and opportunity_id is null`);
      assertEqual(
        psqlAsAlice(`select lead_id || '|' || opportunity_id from crm.activity where id = '${scratchLeadOnlyActivity}'`),
        `${aliceLead}|${aliceOpportunity}`,
        "an activity attached only to the lead keeps its lead_id and gains the new opportunity_id -- both links hold after conversion",
      );
      assertEqual(
        psqlAsAlice(`select lead_id || '|' || opportunity_id from crm.product_interest where id = '${scratchLeadOnlyProductInterest}'`),
        `${aliceLead}|${aliceOpportunity}`,
        "product interest attached only to the lead is preserved and now also attached to the opportunity",
      );
      psqlAsAlice(`delete from crm.activity where id = '${scratchLeadOnlyActivity}'`);
      psqlAsAlice(`delete from crm.product_interest where id = '${scratchLeadOnlyProductInterest}'`);

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

      console.log("Verifying CRM-06.4's party-match hierarchy queries (matching.ts#matchPartyForActor)...");
      const knownActorId = "wa-actor-known-1";
      psqlAsAlice(`insert into crm.conversation_participant (business_id, conversation_id, party_id, external_actor_id) values ('${aliceBusiness}', '${aliceConversation}', '${aliceParty}', '${knownActorId}');`);
      assertEqual(
        psqlAsAlice(`select party_id from crm.conversation_participant where business_id = '${aliceBusiness}' and external_actor_id = '${knownActorId}' and party_id is not null limit 1`),
        aliceParty,
        "tier 1: a known external_actor_id resolves to its party via conversation_participant",
      );
      const priorInteractionActorId = "wa-actor-prior-2";
      psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, external_actor_id) values ('${aliceBusiness}', '${aliceConversation}', '${aliceParty}', 'whatsapp', 'inbound', '${priorInteractionActorId}');`);
      assertEqual(
        psqlAsAlice(`select party_id from crm.interaction where business_id = '${aliceBusiness}' and channel = 'whatsapp' and external_actor_id = '${priorInteractionActorId}' and party_id is not null order by occurred_at desc limit 1`),
        aliceParty,
        "tier 1 fallback: a known external_actor_id also resolves via a prior interaction, not just conversation_participant",
      );
      const alicePhoneParty = psqlAsAlice(`insert into core.parties (business_id, name, phone) values ('${aliceBusiness}', 'Phone Contact', '+911234500000') returning id;`);
      assertEqual(
        psqlAsAlice(`select id from core.parties where business_id = '${aliceBusiness}' and phone = '+911234500000' limit 1`),
        alicePhoneParty,
        "tier 2: an exact phone match resolves to its party",
      );
      assertEqual(
        psqlAsAlice(`select count(*) from crm.conversation_participant where business_id = '${aliceBusiness}' and external_actor_id = 'no-such-actor'`),
        "0",
        "tier 3 (unmatched): an external_actor_id never seen before matches nothing -- matchPartyForActor() leaves party_id null rather than guessing",
      );
      assertEqual(
        psqlAsBob(`select count(*) from core.parties where phone = '+911234500000'`),
        "0",
        "Bob's own match lookup cannot see Alice's phone-matched party at all -- RLS scopes the lookup, not just the function's own business_id filter",
      );

      console.log("Verifying CRM-04.5's opportunity contacts (multiple contacts, one primary)...");
      const aliceCompanyParty = psqlAsAlice(`insert into core.parties (business_id, name, kind) values ('${aliceBusiness}', 'Alice Corp', 'company') returning id;`);
      const aliceContact1 = psqlAsAlice(`insert into core.party_contacts (business_id, party_id, first_name) values ('${aliceBusiness}', '${aliceCompanyParty}', 'Priya') returning id;`);
      const aliceContact2 = psqlAsAlice(`insert into core.party_contacts (business_id, party_id, first_name) values ('${aliceBusiness}', '${aliceCompanyParty}', 'Rahul') returning id;`);
      const aliceOppContact1 = psqlAsAlice(`insert into crm.opportunity_contact (business_id, opportunity_id, party_contact_id, is_primary) values ('${aliceBusiness}', '${aliceOpportunity}', '${aliceContact1}', true) returning id;`);
      const aliceOppContact2 = psqlAsAlice(`insert into crm.opportunity_contact (business_id, opportunity_id, party_contact_id) values ('${aliceBusiness}', '${aliceOpportunity}', '${aliceContact2}') returning id;`);
      assertEqual(
        psqlAsAlice(`select count(*) from crm.opportunity_contact where opportunity_id = '${aliceOpportunity}'`),
        "2",
        "an opportunity can have multiple contacts",
      );
      assertThrows(
        () => psqlAsAlice(`update crm.opportunity_contact set is_primary = true where id = '${aliceOppContact2}'`),
        "a second primary contact on the same opportunity is rejected -- setPrimaryOpportunityContact() relies on this to guarantee at most one",
      );
      psqlAsAlice(`update crm.opportunity_contact set is_primary = false where id = '${aliceOppContact1}'`);
      psqlAsAlice(`update crm.opportunity_contact set is_primary = true where id = '${aliceOppContact2}'`);
      assertEqual(
        psqlAsAlice(`select is_primary from crm.opportunity_contact where id = '${aliceOppContact2}'`),
        "t",
        "unsetting the old primary first (setPrimaryOpportunityContact()'s own two-step order) allows a new one to be set",
      );

      console.log("Verifying CRM-05.2's next_action_id (one prominent next action per lead/opportunity)...");
      const aliceNextActionActivity = psqlAsAlice(`insert into crm.activity (business_id, type, opportunity_id, owner_id, due_at) values ('${aliceBusiness}', 'call', '${aliceOpportunity}', '${aliceEmployee}', now() + interval '2 days') returning id;`);
      psqlAsAlice(`update crm.opportunity set next_action_id = '${aliceNextActionActivity}' where id = '${aliceOpportunity}'`);
      assertEqual(
        psqlAsAlice(`select next_action_id from crm.opportunity where id = '${aliceOpportunity}'`),
        aliceNextActionActivity,
        "an opportunity can be given a next_action_id pointing at one of its own activities",
      );
      psqlAsAlice(`update crm.activity set completed_at = now() where id = '${aliceNextActionActivity}'`);
      psqlAsAlice(`update crm.opportunity set next_action_id = null where id = '${aliceOpportunity}'`);
      assertEqual(
        psqlAsAlice(`select next_action_id from crm.opportunity where id = '${aliceOpportunity}'`),
        "",
        "clearing next_action_id after completing it (completeOpportunityNextActionAction()'s own two-step order) leaves it unset",
      );

      console.log("Verifying CRM-05.4's assignment history (at most one open assignment per entity)...");
      const aliceEmployee2 = psqlAsAlice(`insert into core.employees (business_id, user_id) values ('${aliceBusiness}', '${ALICE}') returning id;`);
      const aliceAssignment1 = psqlAsAlice(`insert into crm.assignment (business_id, entity_type, entity_id, owner_id) values ('${aliceBusiness}', 'opportunity', '${aliceOpportunity}', '${aliceEmployee}') returning id;`);
      // assignEntity()'s own two-step order: close out any open assignment for this
      // entity, then start a new one -- replicated here exactly as the mutation runs it.
      psqlAsAlice(`update crm.assignment set unassigned_at = now() where business_id = '${aliceBusiness}' and entity_type = 'opportunity' and entity_id = '${aliceOpportunity}' and unassigned_at is null`);
      const aliceAssignment2 = psqlAsAlice(`insert into crm.assignment (business_id, entity_type, entity_id, owner_id) values ('${aliceBusiness}', 'opportunity', '${aliceOpportunity}', '${aliceEmployee2}') returning id;`);
      assertEqual(
        psqlAsAlice(`select count(*) from crm.assignment where entity_type = 'opportunity' and entity_id = '${aliceOpportunity}' and unassigned_at is null`),
        "1",
        "reassigning closes out the previous open assignment row -- at most one stays open per entity",
      );
      assertEqual(psqlAsAlice(`select owner_id from crm.assignment where id = '${aliceAssignment2}'`), aliceEmployee2, "the new assignment row is the one still open");
      assertEqual(psqlAsAlice(`select unassigned_at is not null from crm.assignment where id = '${aliceAssignment1}'`), "t", "the earlier assignment row is now closed");

      console.log("Verifying CRM-07.3/07.4's party-less conversation dedup (unresolved WhatsApp sender)...");
      const unmatchedActorId = "wa-actor-unmatched-1";
      // findOrCreateConversation()'s own new branch, replicated at the SQL level: no
      // existing conversation_participant row for this external_actor_id yet, so a
      // party-less conversation is created and a participant row links the actor to it.
      const unresolvedConversation = psqlAsAlice(`insert into crm.conversation (business_id, party_id, primary_channel) values ('${aliceBusiness}', null, 'whatsapp') returning id;`);
      psqlAsAlice(`insert into crm.conversation_participant (business_id, conversation_id, party_id, external_actor_id) values ('${aliceBusiness}', '${unresolvedConversation}', null, '${unmatchedActorId}');`);
      assertEqual(
        psqlAsAlice(`select conversation_id from crm.conversation_participant where business_id = '${aliceBusiness}' and external_actor_id = '${unmatchedActorId}'`),
        unresolvedConversation,
        "an unmatched sender's first message creates a real, party-less conversation",
      );
      psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, external_actor_id, external_message_id) values ('${aliceBusiness}', '${unresolvedConversation}', null, 'whatsapp', 'inbound', '${unmatchedActorId}', 'wamid.first');`);
      // A second message from the same still-unmatched sender: findOrCreateConversation()
      // looks up conversation_participant by external_actor_id (not party_id, which is
      // null) and appends to the same conversation rather than creating a second one.
      psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, external_actor_id, external_message_id) values ('${aliceBusiness}', (select conversation_id from crm.conversation_participant where business_id = '${aliceBusiness}' and external_actor_id = '${unmatchedActorId}'), null, 'whatsapp', 'inbound', '${unmatchedActorId}', 'wamid.second');`);
      assertEqual(
        psqlAsAlice(`select count(distinct conversation_id) from crm.interaction where business_id = '${aliceBusiness}' and external_actor_id = '${unmatchedActorId}'`),
        "1",
        "a second message from the same still-unmatched sender appends to the same party-less conversation, not a new one",
      );
      assertEqual(
        psqlAsAlice(`select party_id from crm.conversation where id = '${unresolvedConversation}'`),
        "",
        "the conversation stays party-less until a human resolves the match (CRM-06.4 tier 4) -- selecting a null party_id",
      );
      psqlAsAlice(`update crm.conversation set party_id = '${aliceParty}' where id = '${unresolvedConversation}'`);
      assertEqual(
        psqlAsAlice(`select party_id from crm.conversation where id = '${unresolvedConversation}'`),
        aliceParty,
        "resolving the match later is a single update to conversation.party_id -- no interaction or participant rows need to move",
      );

      console.log("Verifying CRM-07.2's channel_connection lookup by (channel, provider, external_account_id) -- the webhook's own business resolution step...");
      const aliceWhatsAppConnection = psqlAsAlice(`insert into crm.channel_connection (business_id, channel, provider, external_account_id, status) values ('${aliceBusiness}', 'whatsapp', 'whatsapp_cloud_api', 'pn-alice-1', 'connected') returning id;`);
      assertEqual(
        psqlAsAlice(`select business_id from crm.channel_connection where channel = 'whatsapp' and provider = 'whatsapp_cloud_api' and external_account_id = 'pn-alice-1'`),
        aliceBusiness,
        "ingestInboundWhatsAppMessage() resolves the owning business from the connection row by phone_number_id alone",
      );
      assertEqual(
        psqlAsBob(`select count(*) from crm.channel_connection where id = '${aliceWhatsAppConnection}'`),
        "0",
        "Bob cannot see Alice's WhatsApp connection -- confirms the webhook's lookup must run on an admin/service-role client, not an RLS-scoped one",
      );

      console.log("Verifying CRM-07.8's WhatsApp template catalog (tenant isolation + dedupe)...");
      const aliceTemplate = psqlAsAlice(`insert into crm.whatsapp_template (business_id, name, language_code, variable_count) values ('${aliceBusiness}', 'order_confirmation', 'en_US', 2) returning id;`);
      assertEqual(psqlAsAlice(`select is_active from crm.whatsapp_template where id = '${aliceTemplate}'`), "t", "a new template defaults to active");
      assertThrows(
        () => psqlAsAlice(`insert into crm.whatsapp_template (business_id, name, language_code, variable_count) values ('${aliceBusiness}', 'order_confirmation', 'en_US', 3)`),
        "a duplicate (business_id, name, language_code) template is rejected -- createWhatsAppTemplate() relies on this to avoid two catalog entries for the same real Meta template",
      );
      assertEqual(
        psqlAsAlice(`insert into crm.whatsapp_template (business_id, name, language_code, variable_count) values ('${aliceBusiness}', 'order_confirmation', 'es_MX', 2) returning language_code;`),
        "es_MX",
        "the same template name in a different language is a distinct, allowed catalog entry",
      );
      assertEqual(psqlAsBob(`select count(*) from crm.whatsapp_template where id = '${aliceTemplate}'`), "0", "Bob cannot see Alice's WhatsApp templates");
      assertThrows(
        () => psqlAsAlice(`insert into crm.whatsapp_template (business_id, name, language_code, variable_count) values ('${aliceBusiness}', 'bad', 'en_US', -1)`),
        "a negative variable_count is rejected",
      );

      console.log("Verifying CRM-07.11's WhatsApp lead capture (auto party creation + dedupe)...");
      const waLeadActorId = "wa-lead-actor-1";
      const waLeadParty = psqlAsAlice(`insert into core.parties (business_id, kind, name, phone) values ('${aliceBusiness}', 'person', 'WhatsApp +911234599999', '+911234599999') returning id;`);
      const waLead = psqlAsAlice(`insert into crm.lead (business_id, party_id, source, source_module, source_reference) values ('${aliceBusiness}', '${waLeadParty}', 'whatsapp', 'whatsapp', '${waLeadActorId}') returning id;`);
      assertEqual(psqlAsAlice(`select source from crm.lead where id = '${waLead}'`), "whatsapp", "captureLeadFromWhatsAppMessage() records source='whatsapp'");
      assertThrows(
        () => psqlAsAlice(`insert into crm.lead (business_id, party_id, source, source_module, source_reference) values ('${aliceBusiness}', '${waLeadParty}', 'whatsapp', 'whatsapp', '${waLeadActorId}')`),
        "a second inbound message from the same WhatsApp sender is rejected by lead_source_reference_uq -- captureLeadFromWhatsAppMessage() relies on this the same way promoteProspectToLead() does",
      );
      assertEqual(psqlAsBob(`select count(*) from crm.lead where id = '${waLead}'`), "0", "Bob cannot see Alice's WhatsApp-captured lead");

      console.log("Verifying CRM-09.1's requires_response rules engine (outbound reply clears prior inbound, mark not actionable)...");
      const rulesActorId = "wa-rules-actor-1";
      const rulesInbound1 = psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction, external_actor_id, requires_response, content_excerpt) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'inbound', '${rulesActorId}', true, 'Is this in stock?') returning id;`);
      const rulesInbound2 = psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction, external_actor_id, requires_response, content_excerpt) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'inbound', '${rulesActorId}', true, 'Also, what is the price?') returning id;`);
      assertEqual(
        psqlAsAlice(`select count(*) from crm.interaction where conversation_id = '${aliceConversation}' and id in ('${rulesInbound1}', '${rulesInbound2}') and requires_response and responded_at is null`),
        "2",
        "both unanswered inbound messages start out needing a response",
      );
      // recordInteraction()'s own outbound branch, replicated: recording a business
      // reply clears every still-unresponded inbound interaction in the same
      // conversation, not just the one it's a literal reply to.
      psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction, content_excerpt) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'outbound', 'Yes, it is in stock, price is 500');`);
      psqlAsAlice(`update crm.interaction set status = 'responded', requires_response = false, responded_at = now() where business_id = '${aliceBusiness}' and conversation_id = '${aliceConversation}' and direction = 'inbound' and requires_response = true and responded_at is null;`);
      assertEqual(
        psqlAsAlice(`select count(*) from crm.interaction where conversation_id = '${aliceConversation}' and requires_response and responded_at is null`),
        "0",
        "a single outbound reply clears requires_response on every prior unanswered inbound interaction in the conversation, not just one",
      );
      assertEqual(psqlAsAlice(`select status from crm.interaction where id = '${rulesInbound1}'`), "responded", "the cleared interaction's status becomes 'responded'");

      const notActionable = psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction, requires_response, content_excerpt) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'inbound', true, 'unsubscribe') returning id;`);
      psqlAsAlice(`update crm.interaction set status = 'ignored', requires_response = false where id = '${notActionable}' and business_id = '${aliceBusiness}';`);
      assertEqual(psqlAsAlice(`select status, requires_response from crm.interaction where id = '${notActionable}'`), "ignored|f", "markInteractionNotActionable() sets status='ignored' and clears requires_response, without setting responded_at (it was never actually answered)");
      assertEqual(psqlAsAlice(`select responded_at is null from crm.interaction where id = '${notActionable}'`), "t", "a not-actionable interaction stays unresponded, distinct from an actually-answered one");
      assertEqual(psqlAsBob(`select count(*) from crm.interaction where id in ('${rulesInbound1}', '${rulesInbound2}', '${notActionable}')`), "0", "Bob cannot see or affect Alice's interactions");

      console.log("Verifying CRM-09.3's intent + confidence storage on crm.interaction...");
      const classifiedInteraction = psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, channel, direction, content_excerpt, intent, intent_confidence) values ('${aliceBusiness}', '${aliceConversation}', 'whatsapp', 'inbound', 'How much does this cost?', 'pricing', 0.6) returning id;`);
      assertEqual(psqlAsAlice(`select intent, intent_confidence from crm.interaction where id = '${classifiedInteraction}'`), "pricing|0.600", "classifyMessageIntent()'s result is stored on the interaction's own intent/intent_confidence columns (CRM-01.2, unused until this story)");
      assertEqual(psqlAsBob(`select count(*) from crm.interaction where id = '${classifiedInteraction}'`), "0", "Bob cannot see Alice's classified interaction");

      console.log("Verifying CRM-09.4's commercial intent override (human correction at full confidence)...");
      psqlAsAlice(`update crm.interaction set intent = 'support', intent_confidence = 1 where id = '${classifiedInteraction}' and business_id = '${aliceBusiness}';`);
      assertEqual(
        psqlAsAlice(`select intent, intent_confidence from crm.interaction where id = '${classifiedInteraction}'`),
        "support|1.000",
        "updateInteractionIntent()'s human correction overwrites the classifier's guess and records full confidence",
      );
      psqlAsBob(`update crm.interaction set intent = 'spam' where id = '${classifiedInteraction}' and business_id = '${bobBusiness}';`);
      assertEqual(
        psqlAsAlice(`select intent from crm.interaction where id = '${classifiedInteraction}'`),
        "support",
        "Bob cannot override Alice's interaction's intent -- updateInteractionIntent()'s own business_id filter (scoped to Bob's business) matches no rows, so Alice's row is unchanged",
      );

      console.log("Verifying CRM-09.5's one-click conversion (lead reuse, conversation linking, original interaction untouched)...");
      const convActorParty = psqlAsAlice(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Convert Test Party') returning id;`);
      const convConversation = psqlAsAlice(`insert into crm.conversation (business_id, party_id, primary_channel) values ('${aliceBusiness}', '${convActorParty}', 'whatsapp') returning id;`);
      const convInteraction = psqlAsAlice(`insert into crm.interaction (business_id, conversation_id, party_id, channel, direction, content_excerpt) values ('${aliceBusiness}', '${convConversation}', '${convActorParty}', 'whatsapp', 'inbound', 'I want to buy this') returning id;`);

      // convertInteractionToLead()'s own upfront check: no active lead exists yet for
      // this party, so it creates one -- replicated here at the SQL level.
      const convLead = psqlAsAlice(`insert into crm.lead (business_id, party_id, source, source_module, source_reference) values ('${aliceBusiness}', '${convActorParty}', 'manual', 'crm_interaction', '${convInteraction}') returning id;`);
      psqlAsAlice(`update crm.conversation set lead_id = '${convLead}' where id = '${convConversation}' and lead_id is null;`);
      assertEqual(
        psqlAsAlice(`select lead_id from crm.conversation where id = '${convConversation}'`),
        convLead,
        "convertInteractionToLead() links the created lead onto the conversation so the Conversations page's own 'Lead: ...' badge surfaces it immediately",
      );
      assertEqual(
        psqlAsAlice(`select count(*) from crm.lead where party_id = '${convActorParty}' and status not in ('won', 'lost')`),
        "1",
        "a party with an already-open lead never gets a second one from a repeat conversion click -- convertInteractionToLead()'s own reuse check",
      );

      const convOpportunity = psqlAsAlice(`insert into crm.opportunity (business_id, party_id, lead_id, source) values ('${aliceBusiness}', '${convActorParty}', '${convLead}', 'manual') returning id;`);
      psqlAsAlice(`update crm.lead set status = 'opportunity' where id = '${convLead}';`);
      psqlAsAlice(`update crm.conversation set opportunity_id = '${convOpportunity}' where id = '${convConversation}' and opportunity_id is null;`);
      assertEqual(
        psqlAsAlice(`select opportunity_id from crm.conversation where id = '${convConversation}'`),
        convOpportunity,
        "convertInteractionToOpportunity() links the resulting opportunity onto the same conversation",
      );
      assertEqual(
        psqlAsAlice(`select content_excerpt from crm.interaction where id = '${convInteraction}'`),
        "I want to buy this",
        "converting to a lead/opportunity never modifies the original interaction row -- CRM-09.5's own 'conversion preserves original interaction'",
      );
      assertEqual(psqlAsBob(`select count(*) from crm.lead where id = '${convLead}'`), "0", "Bob cannot see Alice's converted lead");

      console.log("Verifying CRM-15.5's integration failure handling (status transitions, disconnected guard)...");
      // aliceWhatsAppConnection (CRM-07.2's own section above) starts out 'connected'.
      // applyChannelConnectionHealthResult()'s own classification: a 500 from Meta means
      // provider_error.
      psqlAsAlice(`update crm.channel_connection set status = 'provider_error' where id = '${aliceWhatsAppConnection}' and business_id = '${aliceBusiness}' and status <> 'disconnected';`);
      assertEqual(
        psqlAsAlice(`select status from crm.channel_connection where id = '${aliceWhatsAppConnection}'`),
        "provider_error",
        "a 5xx send/health-check failure flips a connected connection to provider_error",
      );
      // A subsequent successful health check (ok:true) recovers it back to connected.
      psqlAsAlice(`update crm.channel_connection set status = 'connected', last_synced_at = now() where id = '${aliceWhatsAppConnection}' and business_id = '${aliceBusiness}' and status <> 'disconnected';`);
      assertEqual(
        psqlAsAlice(`select status from crm.channel_connection where id = '${aliceWhatsAppConnection}'`),
        "connected",
        "a successful recheck recovers a degraded/provider_error connection back to connected",
      );
      // Once a business has explicitly disconnected, no send/health-check outcome should
      // ever resurrect it -- applyChannelConnectionHealthResult()'s own guard.
      psqlAsAlice(`update crm.channel_connection set status = 'disconnected' where id = '${aliceWhatsAppConnection}' and business_id = '${aliceBusiness}';`);
      psqlAsAlice(`update crm.channel_connection set status = 'reauthorization_required' where id = '${aliceWhatsAppConnection}' and business_id = '${aliceBusiness}' and status <> 'disconnected';`);
      assertEqual(
        psqlAsAlice(`select status from crm.channel_connection where id = '${aliceWhatsAppConnection}'`),
        "disconnected",
        "a disconnected connection is never touched by a later send/health-check outcome",
      );
      psqlAsBob(`update crm.channel_connection set status = 'provider_error' where id = '${aliceWhatsAppConnection}' and business_id = '${bobBusiness}';`);
      assertEqual(
        psqlAsAlice(`select status from crm.channel_connection where id = '${aliceWhatsAppConnection}'`),
        "disconnected",
        "Bob cannot change the status of Alice's channel_connection -- his own business_id filter matches no rows",
      );

      console.log("Verifying tenant isolation between two licensed businesses...");
      const bobParty = psqlAsBob(`insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bob Customer') returning id;`);
      psqlAsBob(`insert into crm.lead (business_id, party_id) values ('${bobBusiness}', '${bobParty}');`);
      assertEqual(psqlAsBob("select count(*) from crm.lead"), "1", "Bob sees only his own lead");
      assertEqual(psqlAsAlice("select count(*) from crm.lead"), "3", "Alice still sees only her own leads (the earlier one, CRM-07.11's WhatsApp-captured one, and CRM-09.5's converted one), none of Bob's");
      assertEqual(psqlAsBob("select count(*) from crm.opportunity"), "0", "Bob sees none of Alice's opportunities");
      assertEqual(psqlAsBob("select count(*) from crm.conversation"), "0", "Bob sees none of Alice's conversations");
      assertEqual(psqlAsBob("select count(*) from crm.interaction"), "0", "Bob sees none of Alice's interactions");
      assertEqual(psqlAsBob("select count(*) from crm.review_item"), "0", "Bob sees none of Alice's review_item rows (CRM-08.5)");

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
      assertThrows(
        () => psqlAsBob(`insert into crm.review_item (business_id, channel_connection_id, provider, external_review_id, occurred_at) values ('${bobBusiness}', '${aliceChannelConnection}', 'google_business_profile', 'review-bob-1', now())`),
        "Bob cannot create a review_item against Alice's channel_connection (CRM-08.5)",
      );
      const bobOpportunity = psqlAsBob(`insert into crm.opportunity (business_id, party_id) values ('${bobBusiness}', '${bobParty}') returning id;`);
      assertThrows(
        () => psqlAsBob(`insert into crm.opportunity_contact (business_id, opportunity_id, party_contact_id) values ('${bobBusiness}', '${bobOpportunity}', '${aliceContact1}')`),
        "Bob cannot link Alice's party contact to his own opportunity",
      );
      assertThrows(
        () => psqlAsBob(`insert into crm.opportunity_contact (business_id, opportunity_id, party_contact_id) values ('${bobBusiness}', '${aliceOpportunity}', '${aliceContact1}')`),
        "Bob cannot create an opportunity_contact against Alice's opportunity",
      );
      assertThrows(
        () => psqlAsBob(`update crm.opportunity set next_action_id = '${aliceNextActionActivity}' where id = '${bobOpportunity}'`),
        "Bob cannot point his own opportunity's next_action_id at Alice's activity",
      );

      console.log("\nAll crm backlog-schema RLS checks passed.");
    },
  });
}

main();
