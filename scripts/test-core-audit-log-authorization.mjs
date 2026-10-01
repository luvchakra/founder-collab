#!/usr/bin/env node
/**
 * SEC-2: audit-log forgery fix (20261001090000_core_audit_log_write_authorization.sql),
 * via the shared harness (C-8). Proves the two forgery paths are closed -- a direct
 * core.write_audit_log() into another tenant's business, and a direct core.rbac_audit()
 * call -- that a member's own direct writes get actor_id forced to themselves, and that
 * the paths that must keep working still do: trigger-written entries, and service-role /
 * no-session writes.
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
    dbNamePrefix: "core_audit_log_authorization_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const alice = (sql) => psqlAs(ALICE, sql);
      const bob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants...");
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

      console.log("Verifying cross-tenant forgery is rejected...");
      assertThrows(
        () => bob(`select core.write_audit_log('${aliceBusiness}', '${ALICE}', 'invoice.cancelled', 'document', null)`),
        "Bob can't write into Alice's business's audit log through write_audit_log()",
      );
      assertThrows(
        () => bob(`select core.rbac_audit('${aliceBusiness}', 'member.removed', 'business_member', null, null, null)`),
        "Bob can't write into Alice's business's audit log through rbac_audit()",
      );
      assertThrows(
        () => bob(`select core.append_audit_log('${aliceBusiness}', '${ALICE}', 'x', 'x', null)`),
        "the internal append function isn't executable by signed-in users",
      );
      assertThrows(
        () => bob(`select core.write_audit_log(null, null, 'x', 'x', null)`),
        "a null business id is rejected for a signed-in caller",
      );
      assertEqual(psql(`select count(*) from core.audit_log where business_id = '${aliceBusiness}'`), "0", "nothing reached Alice's audit log");

      console.log("Verifying a member's own direct write still works, with the actor forced...");
      const own = alice(`select core.write_audit_log('${aliceBusiness}', '${BOB}', 'manual.note', 'thing', null)`);
      assertEqual(alice(`select actor_id from core.audit_log where id = '${own}'`), ALICE, "actor_id is the caller, not the id they passed");
      const bobOwn = bob(`select core.write_audit_log('${bobBusiness}', null, 'manual.note', 'thing', null)`);
      assertEqual(bob(`select actor_id from core.audit_log where id = '${bobOwn}'`), BOB, "a null actor from a signed-in caller is also recorded as the caller");

      console.log("Verifying the trigger path is unchanged...");
      const party = alice(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Acme Inc') returning id;`);
      const doc = alice(`
        insert into core.documents (business_id, doc_type, source_module, party_id)
        values ('${aliceBusiness}', 'sales_order', 'fsm', '${party}') returning id;
      `);
      alice(`update core.documents set status = 'confirmed' where id = '${doc}'`);
      assertEqual(
        alice(`select actor_id from core.audit_log where entity_type = 'document' and entity_id = '${doc}'`),
        ALICE,
        "a trigger-written entry (document status change) still lands, attributed to the user",
      );

      console.log("Verifying service-role / no-session writes stay trusted...");
      const system = psql(`select core.write_audit_log('${aliceBusiness}', null, 'system.job', 'thing', null)`);
      assertEqual(psql(`select coalesce(actor_id::text, 'system') from core.audit_log where id = '${system}'`), "system", "a no-session write (cron/drain) is recorded as system");
      const asService = psql(`set local role service_role; select core.append_audit_log('${bobBusiness}', null, 'system.job', 'thing', null);`);
      assertEqual(psql(`select action from core.audit_log where id = '${asService}'`), "system.job", "service_role can use the internal append");

      console.log("\nAll SEC-2 audit-log authorization checks passed.");
    },
  });
}

main();
