#!/usr/bin/env node
/**
 * SEC-6: tamper-evident, append-only core.audit_log
 * (20261001150000_core_audit_log_tamper_evident.sql), via the shared harness (C-8).
 * Proves every write path is chained, no role can alter or remove entries, tampering by
 * someone who bypasses triggers is detected, the trail outlives a deleted business
 * (the E2E fixture teardown deletes whole accounts), and verification is tenant-scoped.
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
    dbNamePrefix: "core_audit_log_tamper_evident_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const alice = (sql) => psqlAs(ALICE, sql);
      const bob = (sql) => psqlAs(BOB, sql);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        revoke update, delete, truncate on core.audit_log from authenticated;
      `);
      const aliceAccount = psql(`select account_id from core.account_members where user_id = '${ALICE}'`);
      const business = psql(`insert into core.businesses (account_id, name) values ('${aliceAccount}', 'Alice Co') returning id;`);
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;
      `);

      console.log("[1] Every write path is chained...");
      const e1 = alice(`select core.write_audit_log('${business}', null, 'one', 'thing', null)`);
      const e2 = psql(`select core.append_audit_log('${business}', null, 'two', 'thing', null)`);
      const e3 = asService(`insert into core.audit_log (business_id, action, entity_type) values ('${business}', 'three', 'thing') returning id;`);
      assertEqual(psql(`select string_agg(seq::text, ',' order by seq) from core.audit_log where business_id = '${business}'`), "1,2,3", "seq is contiguous per business across user, internal and service-role writes");
      assertEqual(psql(`select prev_hash from core.audit_log where id = '${e1}'`), "GENESIS", "the first entry starts the chain");
      assertEqual(psql(`select (select prev_hash from core.audit_log where id = '${e2}') = (select row_hash from core.audit_log where id = '${e1}')`), "t", "each entry links to the previous entry's hash");
      assertEqual(psql(`select (select prev_hash from core.audit_log where id = '${e3}') = (select row_hash from core.audit_log where id = '${e2}')`), "t", "...including a direct service-role insert");
      bob(`select core.write_audit_log('${bobBusiness}', null, 'bob.one', 'thing', null)`);
      assertEqual(psql(`select seq from core.audit_log where business_id = '${bobBusiness}'`), "1", "each business has its own chain");
      const e4 = psql(`select core.append_audit_log('${business}', null, 'four', 'thing', null)`);
      assertEqual(psql(`select created_at > now() - interval '1 minute' from core.audit_log where id = '${e4}'`), "t", "created_at is set by the database at insert time");
      const forged = asService(`
        insert into core.audit_log (business_id, action, entity_type, created_at, seq, row_hash, prev_hash)
        values ('${business}', 'five', 'thing', '2020-01-01', 1, 'fake', 'fake') returning id;
      `);
      assertEqual(
        psql(`select (created_at > now() - interval '1 minute') || '|' || seq || '|' || (row_hash <> 'fake') || '|' || (prev_hash <> 'fake') from core.audit_log where id = '${forged}'`),
        "true|5|true|true",
        "a backdated, pre-sequenced, pre-hashed insert is overwritten by the chain, never stored as given",
      );

      console.log("[2] Append-only for every role...");
      assertThrows(() => alice(`update core.audit_log set action = 'x' where id = '${e1}'`), "a member can't edit an entry");
      assertThrows(() => alice(`delete from core.audit_log where id = '${e1}'`), "a member can't delete an entry");
      assertThrows(() => asService(`update core.audit_log set action = 'x' where id = '${e1}'`), "service_role can't edit an entry");
      assertThrows(() => asService(`delete from core.audit_log where id = '${e1}'`), "service_role can't delete an entry");
      assertThrows(() => psql(`delete from core.audit_log where id = '${e1}'`), "even the table owner is stopped by the trigger");
      assertThrows(() => psql(`truncate core.audit_log`), "truncate is rejected");
      assertThrows(() => psql(`set core.audit_retention_purge = 'on'; delete from core.audit_log where id = '${e1}'`), "the purge flag can't remove a recent entry");
      assertEqual(asService(`select core.purge_expired_audit_log()`), "0", "the retention purge removes nothing younger than 8 years");
      assertThrows(() => alice(`select core.purge_expired_audit_log()`), "only the service role can run the purge");

      console.log("[3] Verification...");
      assertEqual(alice(`select valid || '|' || entries_checked from core.verify_audit_chain('${business}')`), "true|5", "an untouched chain verifies");
      assertThrows(() => bob(`select * from core.verify_audit_chain('${business}')`), "a non-member can't verify (or probe) another business's chain");

      console.log("[4] Tampering by someone who bypasses triggers is detected...");
      const e2Seq = psql(`select seq from core.audit_log where id = '${e2}'`);
      psql(`set session_replication_role = replica; update core.audit_log set action = 'tampered' where id = '${e2}';`);
      assertEqual(alice(`select valid || '|' || first_invalid_seq || '|' || reason from core.verify_audit_chain('${business}')`), `false|${e2Seq}|hash mismatch: entry was altered`, "an altered entry is detected at its seq");
      psql(`set session_replication_role = replica; update core.audit_log set action = 'two' where id = '${e2}';`);
      assertEqual(alice(`select valid from core.verify_audit_chain('${business}')`), "t", "restoring the original content verifies again");
      psql(`set session_replication_role = replica; delete from core.audit_log where id = '${e2}';`);
      assertEqual(alice(`select valid || '|' || reason from core.verify_audit_chain('${business}')`), "false|sequence gap: an entry is missing", "a removed middle entry is detected");

      console.log("[5] The trail outlives a deleted business (E2E teardown shape)...");
      const bobAccount = psql(`select account_id from core.businesses where id = '${bobBusiness}'`);
      psql(`delete from core.accounts where id = '${bobAccount}'`);
      assertEqual(psql(`select count(*) from core.businesses where id = '${bobBusiness}'`), "0", "deleting the account still cascades the business away");
      assertEqual(psql(`select string_agg(action, ',' order by seq) from core.audit_log where business_id = '${bobBusiness}'`), "bob.one,business.deleted", "its audit trail survives, ending with the deletion itself");
      assertEqual(psql(`select valid from core.verify_audit_chain('${bobBusiness}')`), "t", "the surviving trail still verifies");
      assertEqual(alice(`select count(*) from core.audit_log where business_id = '${bobBusiness}'`), "0", "orphaned entries are invisible to users");

      console.log("\nAll SEC-6 tamper-evident audit log checks passed.");
    },
  });
}

main();
