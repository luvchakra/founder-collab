#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for `gst.bank_rules` (FIN-8),
 * plus its own invariants: a rule's account and party must belong to its business, a rule
 * deleted after categorising a line leaves the line's match standing (`rule_id` set null),
 * and applying a rule twice to the same line cannot post twice (the entry is keyed
 * `bank_txn:<id>` on the existing unique idempotency index).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business
const DAVE = "44444444-4444-4444-4444-444444444444"; // accountant in Alice's business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_bank_rules_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asBob = (sql) => psqlAs(BOB, sql);
      const asCarol = (sql) => psqlAs(CAROL, sql);
      const asDave = (sql) => psqlAs(DAVE, sql);

      console.log("Seeding two businesses, a viewer and an accountant, Finance licences...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com'), ('${DAVE}', 'dave@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
      `);
      const alice = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;`);
      const bob = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;`);
      psql(`
        insert into core.business_members (business_id, user_id, role) values
          ('${alice}', '${ALICE}', 'owner'), ('${alice}', '${CAROL}', 'viewer'),
          ('${alice}', '${DAVE}', 'accountant'), ('${bob}', '${BOB}', 'owner')
        on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${alice}', '${bob}');
      `);
      const account = (business, number, name, type) =>
        psql(`insert into gst.accounts (business_id, account_number, name, type) values ('${business}', '${number}', '${name}', '${type}') returning id;`);
      const aliceBank = account(alice, "1100", "Bank", "asset");
      const aliceSoftware = account(alice, "6500", "Software", "expense");
      const bobSoftware = account(bob, "6500", "Software", "expense");
      const bobParty = psql(`insert into core.parties (business_id, name) values ('${bob}', 'Bob Vendor') returning id;`);

      const insertRule = (business, name, accountId, partyId = null) => `
        insert into gst.bank_rules (business_id, name, match_text, direction, account_id, party_id)
        values ('${business}', '${name}', 'AWS', 'out', '${accountId}', ${partyId ? `'${partyId}'` : "null"})
        returning id`;

      console.log("Permission gating: a viewer cannot create a rule; the owner and an accountant can...");
      assertThrows(() => asCarol(insertRule(alice, "Viewer rule", aliceSoftware)), "viewer lacks gst.bank_rules.manage");
      const rule = asAlice(insertRule(alice, "Cloud hosting", aliceSoftware));
      assertEqual(rule.length, 36, "owner created a rule");
      const daveRule = asDave(insertRule(alice, "Accountant rule", aliceSoftware));
      assertEqual(daveRule.length, 36, "accountant (granted explicitly) created a rule");
      assertEqual(asCarol(`select count(*) from gst.bank_rules`), "2", "a viewer can still read the rules");

      console.log("One name per business...");
      assertThrows(() => asAlice(insertRule(alice, "Cloud hosting", aliceSoftware)), "duplicate rule name refused");

      console.log("Cross-tenant references are refused: another business's account or party...");
      assertThrows(() => asAlice(insertRule(alice, "Smuggled account", bobSoftware)), "account from another business");
      assertThrows(() => asAlice(insertRule(alice, "Smuggled party", aliceSoftware, bobParty)), "party from another business");

      console.log("Tenant isolation: Bob sees none of Alice's rules and cannot change them...");
      assertEqual(asBob(`select count(*) from gst.bank_rules`), "0", "Bob reads nothing of Alice's");
      assertEqual(asBob(`update gst.bank_rules set name = 'hijacked' where id = '${rule}' returning id`), "", "Bob's update touches nothing");
      assertEqual(asBob(`delete from gst.bank_rules where id = '${rule}' returning id`), "", "Bob's delete touches nothing");
      assertThrows(() => asBob(insertRule(alice, "Bob into Alice", aliceSoftware)), "Bob cannot insert into Alice's business");

      console.log("Applying a rule: the entry is keyed on the line, so it cannot post twice...");
      const bankAccount = psql(`insert into gst.bank_accounts (business_id, name, ledger_account_id) values ('${alice}', 'Current', '${aliceBank}') returning id;`);
      const txn = psql(`insert into gst.bank_transactions (business_id, bank_account_id, txn_date, description, amount)
        values ('${alice}', '${bankAccount}', '2026-09-05', 'POS AWS EMEA', -1180) returning id;`);
      const postEntry = () => asAlice(`
        with e as (
          insert into gst.journal_entries (business_id, entry_number, posting_date, status, source_module, source_entity_type, source_entity_id, posting_rule_key, posting_rule_version, idempotency_key)
          values ('${alice}', 'JE-1', '2026-09-05', 'posted', 'finance', 'bank_transaction', '${txn}', 'bank.rule', 1, 'bank_txn:${txn}') returning id
        ), l as (
          insert into gst.journal_lines (business_id, entry_id, line_number, account_id, debit, credit)
          select '${alice}', e.id, v.n, v.a::uuid, v.d, v.c from e, (values (1, '${aliceBank}', 0, 1180), (2, '${aliceSoftware}', 1180, 0)) as v(n, a, d, c)
        )
        select id from e`);
      const entry = postEntry();
      assertThrows(() => postEntry(), "second posting for the same line refused by the idempotency index");
      asAlice(`update gst.bank_transactions set status = 'matched', matched_entry_id = '${entry}', rule_id = '${rule}' where id = '${txn}'`);
      assertEqual(asAlice(`select rule_id from gst.bank_transactions where id = '${txn}'`), rule, "the line records which rule categorised it");

      console.log("Deleting the rule keeps the line's entry and match; only rule_id clears...");
      asAlice(`delete from gst.bank_rules where id = '${rule}'`);
      assertEqual(
        asAlice(`select status || '|' || (matched_entry_id = '${entry}') || '|' || coalesce(rule_id::text, 'null') from gst.bank_transactions where id = '${txn}'`),
        "matched|true|null",
        "match stands, rule reference cleared",
      );

      console.log("Licence gating: during the read-only grace period rules are readable but not writable; expired, not even readable...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '30 days' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.bank_rules`), "1", "readable during grace");
      assertThrows(() => asAlice(insertRule(alice, "Grace rule", aliceSoftware)), "no new rules during grace");
      assertEqual(asAlice(`update gst.bank_rules set priority = 1 where id = '${daveRule}' returning id`), "", "no edits during grace");
      psql(`update core.licenses set status = 'expired' where business_id = '${alice}' and module_key = 'gst';`);
      assertEqual(asAlice(`select count(*) from gst.bank_rules`), "0", "unreadable once expired");
      assertEqual(psql(`select count(*) from gst.bank_rules where business_id = '${alice}'`), "1", "but retained (ADR-9)");

      console.log("All gst.bank_rules assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
