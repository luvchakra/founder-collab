#!/usr/bin/env node
/**
 * PRIV-1: core.communication_suppressions (20261002100000_core_communication_suppressions.sql),
 * via the shared harness (C-8). Tenant isolation, append-only, the read-only role, the
 * membership check in core.is_email_suppressed(), and that core.email_hash() matches the
 * hash the app signs into unsubscribe links (packages/core/src/privacy/unsubscribe-token.ts).
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer in Alice's business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_communication_suppressions_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const alice = (sql) => psqlAs(ALICE, sql);
      const bob = (sql) => psqlAs(BOB, sql);
      const carol = (sql) => psqlAs(CAROL, sql);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'), ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
      `);
      const business = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;`);
      const bobBusiness = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;`);
      psql(`insert into core.business_members (business_id, user_id, role) values
        ('${business}', '${ALICE}', 'owner'), ('${business}', '${CAROL}', 'viewer'), ('${bobBusiness}', '${BOB}', 'owner')
        on conflict do nothing;`);

      console.log("[1] Hashing matches the app...");
      const appHash = createHash("sha256").update("ravi@example.in").digest("hex");
      assertEqual(psql(`select core.email_hash('  Ravi@Example.IN ')`), appHash, "core.email_hash() normalises exactly like emailHash() in TypeScript");

      console.log("[2] Recording opt-outs...");
      asService(`insert into core.communication_suppressions (business_id, email_hash, reason) values ('${business}', core.email_hash('ravi@example.in'), 'unsubscribe');`);
      assertEqual(alice(`select core.is_email_suppressed('${business}', 'RAVI@example.in')`), "t", "an unsubscribed address is suppressed, case-insensitively");
      assertEqual(alice(`select core.is_email_suppressed('${business}', 'priya@example.in')`), "f", "another address isn't");
      assertEqual(bob(`select core.is_email_suppressed('${bobBusiness}', 'ravi@example.in')`), "f", "an opt-out applies to the business it was given to, not every business");
      alice(`insert into core.communication_suppressions (business_id, email_hash, reason, created_by) values ('${business}', core.email_hash('priya@example.in'), 'manual', '${ALICE}');`);
      assertEqual(alice(`select core.is_email_suppressed('${business}', 'priya@example.in')`), "t", "a member can record an opt-out by hand");
      assertThrows(() => alice(`insert into core.communication_suppressions (business_id, email_hash, reason, created_by) values ('${business}', core.email_hash('x@y.z'), 'manual', '${BOB}')`), "...but not attributed to someone else");
      assertThrows(() => carol(`insert into core.communication_suppressions (business_id, email_hash, reason, created_by) values ('${business}', core.email_hash('x@y.z'), 'manual', '${CAROL}')`), "a read-only member can't write");
      assertThrows(() => asService(`insert into core.communication_suppressions (business_id, email_hash, reason) values ('${business}', 'ravi@example.in', 'unsubscribe')`), "only a hash is ever stored, never the address");

      console.log("[3] Append-only...");
      assertThrows(() => alice(`delete from core.communication_suppressions where business_id = '${business}'`), "a member can't delete an opt-out");
      assertThrows(() => alice(`update core.communication_suppressions set reason = 'manual' where business_id = '${business}'`), "...or change one");
      assertThrows(() => asService(`delete from core.communication_suppressions where business_id = '${business}'`), "...nor can the service role");
      assertEqual(alice(`select core.is_email_suppressed('${business}', 'ravi@example.in')`), "t", "the opt-out is still there");

      console.log("[4] Tenant isolation...");
      assertEqual(bob(`select count(*) from core.communication_suppressions where business_id = '${business}'`), "0", "Bob sees none of Alice's opt-outs");
      assertThrows(() => bob(`select core.is_email_suppressed('${business}', 'ravi@example.in')`), "Bob can't probe whether an address opted out of Alice's mail");
      assertThrows(() => bob(`insert into core.communication_suppressions (business_id, email_hash, reason, created_by) values ('${business}', core.email_hash('z@z.z'), 'manual', '${BOB}')`), "Bob can't add opt-outs to Alice's business");

      console.log("\nAll PRIV-1 suppression checks passed.");
    },
  });
}

main();
