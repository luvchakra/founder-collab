#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.ai_runs/ai_provider_credentials (Epic 6,
 * story S-4; CLAUDE.md principle 9), via the shared harness (C-8). Tenant-only RLS, no
 * license gate -- same reasoning core.messages (S-3) already documents: this is
 * cross-module infrastructure, not a licensed module's own feature.
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
    dbNamePrefix: "core_ai_usage_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

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

      console.log("Verifying an ai_runs row can be recorded and read back...");
      psqlAsAlice(`
        insert into core.ai_runs (business_id, operation, model, prompt_version, input_hash, input_tokens, output_tokens, estimated_cost, status)
        values ('${aliceBusiness}', 'draft_reply', 'claude-fake', 'v1', 'hash1', 100, 50, 0.001234, 'succeeded');
      `);
      assertEqual(psqlAsAlice("select count(*) from core.ai_runs"), "1", "Alice sees her own ai_runs row");
      assertEqual(psqlAsBob("select count(*) from core.ai_runs"), "0", "Bob sees none of Alice's ai_runs rows");

      console.log("Verifying ai_runs is append-only (no update/delete policy)...");
      // RLS enabled + no policy for a command doesn't throw -- it silently matches zero
      // rows (Postgres' own RLS default), so "append-only" is verified by the row
      // surviving unchanged, not by an exception.
      psqlAsAlice(`update core.ai_runs set status = 'failed' where business_id = '${aliceBusiness}'`);
      assertEqual(psqlAsAlice("select status from core.ai_runs"), "succeeded", "an update against ai_runs silently affects zero rows -- no update policy exists");
      psqlAsAlice(`delete from core.ai_runs where business_id = '${aliceBusiness}'`);
      assertEqual(psqlAsAlice("select count(*) from core.ai_runs"), "1", "a delete against ai_runs silently affects zero rows -- no delete policy exists");

      console.log("Verifying ai_provider_credentials: create, one per business, tenant isolation...");
      psqlAsAlice(`
        insert into core.ai_provider_credentials (business_id, provider, encrypted_api_key, key_fingerprint)
        values ('${aliceBusiness}', 'openai', 'ciphertext', 'fp1');
      `);
      assertThrows(
        () => psqlAsAlice(`
          insert into core.ai_provider_credentials (business_id, provider, encrypted_api_key, key_fingerprint)
          values ('${aliceBusiness}', 'anthropic', 'ciphertext2', 'fp2');
        `),
        "a second ai_provider_credentials row for the same business is rejected (unique(business_id))",
      );
      assertEqual(
        psqlAsAlice("select provider from core.ai_provider_credentials"),
        "openai",
        "Alice can read her own provider credential",
      );
      assertEqual(psqlAsBob("select count(*) from core.ai_provider_credentials"), "0", "Bob sees none of Alice's provider credentials");
      // Bob's own USING clause filters Alice's row out entirely -- the update matches
      // zero rows silently, same "no error, just no-op" RLS behavior as above.
      psqlAsBob(`update core.ai_provider_credentials set status = 'error' where business_id = '${aliceBusiness}'`);
      assertEqual(
        psqlAsAlice("select status from core.ai_provider_credentials"),
        "connected",
        "Bob's update against Alice's provider credential silently affects zero rows",
      );

      console.log("Verifying no license gate at all -- this is cross-module infrastructure, not a licensed feature...");
      assertEqual(psqlAsBob("select count(*) from core.licenses"), "0", "sanity: Bob has no licenses of any kind");
      psqlAsBob(`
        insert into core.ai_runs (business_id, operation, model, prompt_version, input_hash, status)
        values ('${bobBusiness}', 'draft_reply', 'claude-fake', 'v1', 'hash2', 'succeeded');
      `);
      assertEqual(psqlAsBob("select count(*) from core.ai_runs"), "1", "Bob can record an ai_runs row with zero licenses at all -- tenant-only RLS");

      console.log("\nAll core ai-usage RLS checks passed.");
    },
  });
}

main();
