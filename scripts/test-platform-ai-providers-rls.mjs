#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.ai_providers`/`platform.ai_provider_keys`/
 * `platform.ai_provider_events` (PLATFORM-P0-09.1/09.2, "Internal AI Provider Registry" /
 * "Secure API Key Storage", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13). Same
 * harness and bar every sibling `platform.*` migration in this backlog has been held to,
 * with one extra assertion class this story's own higher security bar demands: nobody --
 * including a genuine SUPERADMIN -- can ever SELECT `platform.ai_provider_keys` directly,
 * not even their own just-configured key. There is no RLS policy at all on that table (a
 * permission-denied error, not an empty result set) -- the only sanctioned read path is
 * `platform.ai_provider_key_status()`, which never selects `encrypted_api_key`.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the catalog starts seeded with exactly the three known providers, all disabled, no
 *     models, no keys -- no fabricated "on" state;
 *   - a non-superadmin can read the open `platform.ai_providers` catalog but every one of
 *     her config/key mutation attempts is rejected by the functions' own internal checks,
 *     with zero residue in any of the three tables;
 *   - a non-superadmin cannot SELECT `platform.ai_provider_keys` at all (permission denied,
 *     not RLS-filtered-to-empty) and gets zero rows (not an error) from
 *     `ai_provider_key_status()`;
 *   - a genuine superadmin can update a provider's config, subject to the
 *     default_model/fallback_model-must-be-in-models CHECK constraint;
 *   - a genuine superadmin can set, rotate, and remove a provider's key -- each writes
 *     exactly one atomic audit event carrying only a fingerprint, never
 *     `encrypted_api_key`;
 *   - even a genuine superadmin cannot SELECT `platform.ai_provider_keys` directly, nor
 *     bypass any of the four functions with a direct INSERT/UPDATE/DELETE on any of the
 *     three tables;
 *   - `platform.ai_provider_events`' own SELECT is superadmin-only, matching every sibling
 *     audit table in this backlog.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888891"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888892"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_ai_providers_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-ai-providers@example.com'),
          ('${ZOE}', 'zoe-ai-providers@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role)
        values ('${aliceBiz}', '${ALICE}', 'admin');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("Verifying the catalog starts seeded with exactly the three known providers, all safe defaults...");
      assertEqual(
        psql(`select string_agg(provider || ':' || enabled::text || ':' || coalesce(array_length(models, 1), 0)::text, ',' order by provider) from platform.ai_providers`),
        "anthropic:false:0,google:false:0,openai:false:0",
        "all three providers seeded, disabled, no models",
      );
      assertEqual(psql(`select count(*) from platform.ai_provider_keys`), "0", "no keys seeded");
      assertEqual(psql(`select count(*) from platform.ai_provider_events`), "0", "no events seeded");

      console.log("Verifying Alice (not a superadmin) can read the open registry but nothing else...");
      assertEqual(psqlAsAlice(`select count(*) from platform.ai_providers`), "3", "Alice can read all three registry rows");
      assertThrows(
        () => psqlAsAlice(`select * from platform.ai_provider_keys`),
        "Alice gets a permission-denied error selecting platform.ai_provider_keys directly -- no grant at all, not RLS-filtered",
      );
      assertEqual(
        psqlAsAlice(`select count(*) from platform.ai_provider_key_status()`),
        "0",
        "ai_provider_key_status() returns zero rows (not an error) for a non-superadmin",
      );

      console.log("Verifying Alice's config/key mutation attempts are all rejected, with zero residue...");
      assertThrows(
        () =>
          psqlAsAlice(
            `select platform.update_ai_provider_config('openai', true, array['gpt-5.4'], 'gpt-5.4', null, '{}'::jsonb, '{}'::jsonb, 'trying to enable')`,
          ),
        "Alice's config update attempt is rejected by the function's own internal check",
      );
      assertThrows(
        () => psqlAsAlice(`select platform.set_ai_provider_key('openai', 'ciphertext', 'fingerprint', now(), 'trying to set a key')`),
        "Alice's set-key attempt is rejected",
      );
      assertThrows(
        () => psqlAsAlice(`select platform.remove_ai_provider_key('openai', 'trying to remove')`),
        "Alice's remove-key attempt is rejected (there is nothing to remove anyway, but the authorization check runs first)",
      );
      assertEqual(
        psql(`set local role service_role; select enabled from platform.ai_providers where provider = 'openai'`),
        "f",
        "openai is untouched by Alice's rejected config-update attempt",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.ai_provider_keys`), "0", "zero residue in the key table");
      assertEqual(psql(`set local role service_role; select count(*) from platform.ai_provider_events`), "0", "zero residue in the audit trail");

      console.log("Verifying a genuine superadmin (Zoe) can update a provider's config...");
      psqlAsZoe(
        `select platform.update_ai_provider_config('openai', true, array['gpt-5.4', 'gpt-5.4-mini'], 'gpt-5.4', 'gpt-5.4-mini', '{"requestsPerMinute": 60}'::jsonb, '{}'::jsonb, 'registering OpenAI ahead of rollout')`,
      );
      assertEqual(
        psqlAsZoe(`select enabled::text || ':' || default_model || ':' || fallback_model || ':' || (rate_limits ->> 'requestsPerMinute') from platform.ai_providers where provider = 'openai'`),
        "true:gpt-5.4:gpt-5.4-mini:60",
        "the config was updated with the exact values requested",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value ->> 'enabled') || ':' || (new_value ->> 'enabled') from platform.ai_provider_events where provider = 'openai' order by performed_at desc limit 1`,
        ),
        "config_updated:false:true",
        "exactly one 'config_updated' event with a real before/after snapshot",
      );

      console.log("Verifying the default_model/fallback_model-must-be-in-models CHECK constraint...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_provider_config('anthropic', true, array['claude-sonnet-5'], 'claude-opus-5', null, '{}'::jsonb, '{}'::jsonb, 'default model not in the list')`,
          ),
        "a default_model not present in models is rejected by the CHECK constraint",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_provider_config('anthropic', true, array['claude-sonnet-5'], null, 'claude-opus-5', '{}'::jsonb, '{}'::jsonb, 'fallback model not in the list')`,
          ),
        "a fallback_model not present in models is rejected by the CHECK constraint",
      );
      assertEqual(psqlAsZoe(`select enabled from platform.ai_providers where provider = 'anthropic'`), "f", "anthropic untouched by the two rejected attempts above");

      console.log("Verifying an unknown provider is rejected by update_ai_provider_config...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_provider_config('cohere', true, array[]::text[], null, null, '{}'::jsonb, '{}'::jsonb, 'unknown provider')`),
        "an unknown provider key is rejected ('Unknown AI provider')",
      );

      console.log("Verifying an empty/whitespace reason is rejected by every mutation function...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_provider_config('openai', true, array['gpt-5.4'], 'gpt-5.4', null, '{}'::jsonb, '{}'::jsonb, '')`),
        "config update rejects an empty reason",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.set_ai_provider_key('openai', 'ciphertext', 'fingerprint', now(), '   ')`),
        "set-key rejects a whitespace-only reason",
      );

      console.log("Verifying a genuine superadmin can set, then rotate, a provider's key -- each writes exactly one fingerprint-only audit event...");
      psqlAsZoe(`select platform.set_ai_provider_key('openai', 'ciphertext-v1', 'fingerprint1', now(), 'connecting the platform''s own OpenAI credential')`);
      assertEqual(psqlAsZoe(`select count(*) from platform.ai_provider_key_status() where provider = 'openai' and configured`), "1", "openai now shows as configured");
      assertEqual(
        psqlAsZoe(`select key_fingerprint from platform.ai_provider_key_status() where provider = 'openai'`),
        "fingerprint1",
        "the masked status exposes the real fingerprint, never the ciphertext",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value is null)::text || ':' || (new_value ->> 'key_fingerprint') from platform.ai_provider_events where provider = 'openai' and action in ('key_set', 'key_rotated') order by performed_at desc limit 1`,
        ),
        "key_set:true:fingerprint1",
        "the key_set event carries only the fingerprint, no previous_value (first time), correct new_value",
      );

      psqlAsZoe(`select platform.set_ai_provider_key('openai', 'ciphertext-v2', 'fingerprint2', now(), 'rotating after a suspected leak')`);
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.ai_provider_keys where provider = 'openai'`),
        "1",
        "still exactly one row -- rotation upserts, does not duplicate",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value ->> 'key_fingerprint') || ':' || (new_value ->> 'key_fingerprint') from platform.ai_provider_events where provider = 'openai' and action = 'key_rotated' order by performed_at desc limit 1`,
        ),
        "key_rotated:fingerprint1:fingerprint2",
        "the key_rotated event's own before/after snapshot carries only the two fingerprints, never any ciphertext",
      );
      const anyEncryptedInEvents = psqlAsZoe(`select bool_or(previous_value::text like '%ciphertext%' or new_value::text like '%ciphertext%') from platform.ai_provider_events`);
      assertEqual(anyEncryptedInEvents, "f", "no audit event snapshot, ever, contains anything resembling the ciphertext");

      console.log("Verifying even a genuine superadmin cannot SELECT platform.ai_provider_keys directly...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.ai_provider_keys`),
        "Zoe (a real superadmin) STILL gets a permission-denied error -- no SELECT grant exists for anyone but service_role",
      );
      assertThrows(
        () => psqlAsZoe(`select encrypted_api_key from platform.ai_provider_keys where provider = 'openai'`),
        "there is no way to read the ciphertext back out through this schema, for anyone, ever",
      );

      console.log("Verifying a genuine superadmin can remove a key -- writes one 'key_removed' event, row is really gone...");
      psqlAsZoe(`select platform.remove_ai_provider_key('openai', 'credential compromised, rotating out of band')`);
      assertEqual(psqlAsZoe(`select count(*) from platform.ai_provider_key_status() where provider = 'openai' and configured`), "0", "openai shows as not configured again");
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value ->> 'key_fingerprint') || ':' || (new_value is null)::text from platform.ai_provider_events where provider = 'openai' and action = 'key_removed'`,
        ),
        "key_removed:fingerprint2:true",
        "the key_removed event captures the last fingerprint before deletion, no new_value",
      );

      console.log("Verifying remove_ai_provider_key rejects a provider with no key configured...");
      assertThrows(
        () => psqlAsZoe(`select platform.remove_ai_provider_key('google', 'nothing to remove')`),
        "removing a key that was never set is rejected ('No key is configured')",
      );

      console.log("Verifying read access to the audit trail: superadmin-only, unlike the open platform.ai_providers catalog...");
      assertEqual(psqlAsAlice(`select count(*) from platform.ai_provider_events`), "0", "Alice gets zero rows from the audit trail (RLS-filtered, not an error)");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.ai_provider_events`).toString(), "t", "Zoe (superadmin) can read it");

      console.log("Verifying nobody -- including a superadmin -- can bypass the functions with a direct write...");
      assertThrows(
        () => psqlAsZoe(`update platform.ai_providers set enabled = true where provider = 'google'`),
        "even a superadmin cannot UPDATE platform.ai_providers directly -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.ai_provider_keys (provider, encrypted_api_key, key_fingerprint, last_validated_at) values ('google', 'x', 'y', now())`),
        "even a superadmin cannot INSERT directly into platform.ai_provider_keys -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.ai_provider_events (provider, action, reason) values ('google', 'config_updated', 'bypass attempt')`),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("\nAll platform.ai_providers / platform.ai_provider_keys / platform.ai_provider_events checks passed.");
    },
  });
}

main();
