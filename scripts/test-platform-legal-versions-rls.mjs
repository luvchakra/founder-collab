#!/usr/bin/env node
/**
 * DB test for legal document versions and policy acceptance (PLATFORM-P1-09.1 /
 * PLATFORM-P1-09.4, migration 20261010160000):
 *   - only a superadmin publishes a version, with a summary; versions are never edited or
 *     deleted, and every publish is in platform.audit_log;
 *   - my_legal_status() shows the active version and whether the caller accepted it;
 *   - a user accepts only active versions, only for themselves, once (idempotent), and sees
 *     only their own acceptances; signup acceptance is service_role only;
 *   - a new version that doesn't require acceptance still prompts a user who never accepted.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888898";
const BOB = "88888888-8888-8888-8888-888888888899";
const ZOE = "88888888-8888-8888-8888-88888888889a"; // superadmin

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const publish = (doc, version, hash, summary, requires) =>
  `select platform.publish_legal_document_version('${doc}', '${version}', '${hash}', ${summary === null ? "null" : `'${summary}'`}, ${requires})`;
const status = `select string_agg(document || ':' || version || ':' || accepted || ':' || ever_accepted || ':' || requires_acceptance, ',' order by document) from platform.my_legal_status()`;

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_legal_versions_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-legal@example.com'), ('${BOB}', 'bob-legal@example.com'), ('${ZOE}', 'zoe-legal@example.com');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("Verifying nothing is pending before anything is published...");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.my_legal_status()`), "0", "no versions, nothing to accept");

      console.log("Verifying only a superadmin publishes, with a summary...");
      assertThrows(() => psqlAs(ALICE, publish("terms", "2026-10", HASH_A, "First", true)), "a user can't publish");
      assertThrows(() => psqlAs(ZOE, publish("terms", "2026-10", HASH_A, null, true)), "a summary is required");
      assertThrows(() => psqlAs(ZOE, publish("terms", "2026-10", "nothex", "First", true)), "the hash must be a SHA-256");
      assertThrows(() => psqlAs(ZOE, publish("cookies", "2026-10", HASH_A, "First", true)), "only terms and privacy");
      const termsV1 = psqlAs(ZOE, publish("terms", "2026-10", HASH_A, "First published version", true));
      const privacyV1 = psqlAs(ZOE, publish("privacy", "2026-10", HASH_A, "First published version", true));
      assertThrows(() => psqlAs(ZOE, publish("terms", "2026-10", HASH_B, "Again", true)), "a version label is used once per document");

      console.log("Verifying versions are immutable and audited...");
      assertThrows(() => psqlAs(ZOE, `update platform.legal_document_versions set summary = 'x' where id = '${termsV1}'`), "a superadmin can't edit a version");
      assertThrows(() => psql(`set local role service_role; update platform.legal_document_versions set summary = 'x' where id = '${termsV1}'`), "even service_role can't edit one");
      assertThrows(() => psql(`set local role service_role; delete from platform.legal_document_versions where id = '${termsV1}'`), "or delete one");
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.audit_log where resource_type = 'legal_document' and severity = 'high' and actor_id = '${ZOE}'`),
        "2",
        "both publishes are in the platform audit log",
      );

      console.log("Verifying acceptance: own, active, idempotent, private...");
      assertEqual(psqlAs(ALICE, status), "privacy:2026-10:false:false:true,terms:2026-10:false:false:true", "Alice has both to accept");
      assertEqual(psqlAs(ALICE, `select platform.accept_legal_document_versions(array['${termsV1}', '${privacyV1}']::uuid[])`), "2", "Alice accepts both");
      assertEqual(psqlAs(ALICE, `select platform.accept_legal_document_versions(array['${termsV1}']::uuid[])`), "0", "accepting again records nothing new");
      assertEqual(psqlAs(ALICE, status), "privacy:2026-10:true:true:true,terms:2026-10:true:true:true", "nothing pending for Alice");
      assertEqual(psqlAs(ALICE, `select string_agg(method, ',') from platform.policy_acceptances`), "prompt,prompt", "recorded as accepted from the prompt");
      assertEqual(psqlAs(BOB, `select count(*) from platform.policy_acceptances`), "0", "Bob can't see Alice's acceptances");
      assertEqual(psqlAs(BOB, status), "privacy:2026-10:false:false:true,terms:2026-10:false:false:true", "Bob still has both to accept");
      assertThrows(() => psqlAs(BOB, `insert into platform.policy_acceptances (user_id, version_id, method) values ('${ALICE}', '${termsV1}', 'prompt')`), "no direct writes");
      assertThrows(() => psqlAs(BOB, `select platform.record_signup_legal_acceptance('${BOB}')`), "signup acceptance is service_role only");
      assertThrows(() => psqlAs(ALICE, `update platform.policy_acceptances set accepted_at = now() - interval '1 year'`), "acceptances can't be edited");

      console.log("Verifying a new version replaces the old one...");
      const termsV2 = psqlAs(ZOE, publish("terms", "2026-11", HASH_B, "Clarified refunds", true));
      assertEqual(psqlAs(ALICE, status), "privacy:2026-10:true:true:true,terms:2026-11:false:true:true", "Alice must accept the new Terms");
      assertThrows(() => psqlAs(ALICE, `select platform.accept_legal_document_versions(array['${termsV1}']::uuid[])`), "an old version can't be accepted any more");
      psqlAs(ALICE, `select platform.accept_legal_document_versions(array['${termsV2}']::uuid[])`);
      assertEqual(psqlAs(ALICE, status), "privacy:2026-10:true:true:true,terms:2026-11:true:true:true", "accepted");

      console.log("Verifying a minor version: no re-acceptance, but a first acceptance still needed...");
      psqlAs(ZOE, publish("terms", "2026-11b", HASH_B, "Typo fix", false));
      assertEqual(psqlAs(ALICE, status), "privacy:2026-10:true:true:true,terms:2026-11b:false:true:false", "Alice accepted an earlier Terms; the typo fix doesn't require more");
      assertEqual(psqlAs(BOB, status), "privacy:2026-10:false:false:true,terms:2026-11b:false:false:false", "Bob never accepted any Terms, so he is still asked");

      console.log("Verifying signup records the active versions...");
      assertEqual(psql(`set local role service_role; select platform.record_signup_legal_acceptance('${BOB}')`), "2", "Bob's signup accepts both active versions");
      assertEqual(psqlAs(BOB, `select string_agg(method, ',') from platform.policy_acceptances`), "signup,signup", "recorded as signup");
      assertEqual(psqlAs(BOB, status), "privacy:2026-10:true:true:true,terms:2026-11b:true:true:false", "nothing pending for Bob");

      console.log("\nAll legal version and acceptance checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
