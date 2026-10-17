#!/usr/bin/env node
/**
 * CRM-INSTANT-ACK-01 (migration 20261017120000): tenant isolation, licence gating and
 * permission gating for `crm.instant_reply_settings` (the acknowledgement text), with only
 * the grants the migrations issue on it -- so a missing grant fails here as 42501, not in
 * production. Also: instant reply starts 'off' on every account and connection (sending
 * is opt-in), and the retired 'draft_approve' mode can no longer be stored.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-99999999ac01"; // owner, Alice Co
const BOB = "99999999-9999-9999-9999-99999999ac02"; // owner, Bob Co
const CAROL = "99999999-9999-9999-9999-99999999ac03"; // viewer, Alice Co

async function main() {
  await withTestDatabase({
    dbNamePrefix: "crm_instant_reply_settings_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-ack@example.com'), ('${BOB}', 'bob-ack@example.com'), ('${CAROL}', 'carol-ack@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema crm to authenticated;
      `);
      const business = (user, name) =>
        psql(`insert into core.businesses (account_id, name) select account_id, '${name}' from core.account_members where user_id = '${user}' returning id;`);
      const alice = business(ALICE, "Alice Co");
      const bob = business(BOB, "Bob Co");
      psql(`
        insert into core.business_members (business_id, user_id, role) values ('${alice}', '${CAROL}', 'viewer') on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'crm', 'active' from core.businesses where id in ('${alice}', '${bob}');
      `);

      const upsert = (biz, text) => `
        insert into crm.instant_reply_settings (business_id, ack_text) values ('${biz}', '${text}')
        on conflict (business_id) do update set ack_text = excluded.ack_text
        returning ack_text`;

      console.log("The owner can set and change the acknowledgement text; a viewer can read but not write...");
      assertEqual(psqlAs(ALICE, upsert(alice, "Thanks, back soon")), "Thanks, back soon", "owner set the text");
      assertEqual(psqlAs(ALICE, upsert(alice, "Thanks! Back soon.")), "Thanks! Back soon.", "owner changed it (upsert)");
      assertEqual(psqlAs(CAROL, `select ack_text from crm.instant_reply_settings`), "Thanks! Back soon.", "viewer reads it");
      assertThrows(() => psqlAs(CAROL, upsert(alice, "viewer text")), "viewer lacks channel_connections.manage");
      assertEqual(psqlAs(CAROL, `update crm.instant_reply_settings set ack_text = 'x' returning 1`), "", "viewer's update matches nothing");
      assertThrows(() => psqlAs(ALICE, upsert(alice, "   ")), "blank text refused");
      assertThrows(() => psqlAs(ALICE, `delete from crm.instant_reply_settings`), "no delete grant");

      console.log("Tenant isolation...");
      assertEqual(psqlAs(BOB, `select count(*) from crm.instant_reply_settings`), "0", "Bob sees none of Alice's settings");
      assertThrows(() => psqlAs(BOB, upsert(alice, "Bob was here")), "Bob can't write Alice's text");
      assertEqual(psqlAs(BOB, `update crm.instant_reply_settings set ack_text = 'hacked' where business_id = '${alice}' returning 1`), "", "Bob's update matches nothing");

      console.log("The webhook (service role) can read it...");
      assertEqual(psql(`set local role service_role; select ack_text from crm.instant_reply_settings where business_id = '${alice}';`), "Thanks! Back soon.", "service role reads it");

      console.log("Instant reply is opt-in, and 'draft_approve' is retired...");
      const channel = psql(`insert into crm.channels (business_id, kind, name) values ('${alice}', 'social', 'Instagram') returning id;`);
      const account = psql(`insert into crm.channel_accounts (business_id, channel_id, provider, external_account_id, access_token_encrypted)
        values ('${alice}', '${channel}', 'instagram', 'ig-1', 'enc') returning instant_reply_mode;`);
      assertEqual(account, "off", "a new account starts off");
      assertThrows(() => psql(`update crm.channel_accounts set instant_reply_mode = 'draft_approve' where business_id = '${alice}'`), "draft_approve refused on accounts");
      const connection = psql(`insert into crm.channel_connection (business_id, channel, provider, external_account_id)
        values ('${alice}', 'whatsapp', 'whatsapp_cloud_api', 'pn-1') returning instant_reply_mode;`);
      assertEqual(connection, "off", "a new WhatsApp connection starts off");
      assertThrows(() => psql(`update crm.channel_connection set instant_reply_mode = 'draft_approve' where business_id = '${alice}'`), "draft_approve refused on connections");
      psql(`update crm.channel_connection set instant_reply_mode = 'instant_ack_then_human' where business_id = '${alice}'`);

      console.log("Licence gating: read-only in grace, unreadable once expired, retained (ADR-9)...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '30 days' where business_id = '${alice}' and module_key = 'crm';`);
      assertEqual(psqlAs(ALICE, `select count(*) from crm.instant_reply_settings`), "1", "readable during grace");
      assertThrows(() => psqlAs(ALICE, `insert into crm.instant_reply_settings (business_id, ack_text) values ('${alice}', 'x')`), "no insert during grace");
      assertEqual(psqlAs(ALICE, `update crm.instant_reply_settings set ack_text = 'grace' returning 1`), "", "no edits during grace");
      psql(`update core.licenses set status = 'expired' where business_id = '${alice}' and module_key = 'crm';`);
      assertEqual(psqlAs(ALICE, `select count(*) from crm.instant_reply_settings`), "0", "unreadable once expired");
      assertEqual(psql(`select count(*) from crm.instant_reply_settings where business_id = '${alice}'`), "1", "but retained");

      console.log("\nAll instant-reply settings checks passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
