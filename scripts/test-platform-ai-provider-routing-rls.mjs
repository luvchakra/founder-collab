#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.ai_provider_routing`/
 * `platform.ai_provider_routing_events` (PLATFORM-P0-09.3, "Provider Routing", CONFIG-ONLY,
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13). Same harness and bar every sibling
 * `platform.*` migration in this backlog has been held to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the singleton row is seeded on migrate, with no provider/model set and an empty
 *     override map -- no fabricated "on" state;
 *   - a non-superadmin can read the open policy row but her mutation attempt is rejected
 *     by the function's own internal check, with zero residue in either table;
 *   - a genuine superadmin can set the full policy (default provider/model, fallback
 *     provider, module overrides), which writes exactly one atomic audit event carrying a
 *     real before/after snapshot;
 *   - an unknown provider (default, fallback, or inside a module override) is rejected,
 *     and an unknown module key inside a module override is rejected -- with zero residue;
 *   - a non-object `module_overrides` value is rejected;
 *   - an empty/whitespace reason is rejected;
 *   - the audit trail's own SELECT is superadmin-only (a non-superadmin gets zero rows,
 *     RLS-filtered, not an error);
 *   - nobody -- including a superadmin -- can bypass the function with a direct
 *     INSERT/UPDATE/DELETE on either table.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888893"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888894"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_ai_provider_routing_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-ai-routing@example.com'),
          ('${ZOE}', 'zoe-ai-routing@example.com');
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

      console.log("Verifying the singleton row starts seeded with no fabricated state...");
      assertEqual(psql(`select count(*) from platform.ai_provider_routing`), "1", "exactly one routing-policy row exists");
      assertEqual(
        psql(
          `select coalesce(default_provider, 'null') || ':' || coalesce(default_model, 'null') || ':' || coalesce(fallback_provider, 'null') || ':' || module_overrides::text from platform.ai_provider_routing`,
        ),
        "null:null:null:{}",
        "no provider/model set, no overrides -- nothing fabricated",
      );
      assertEqual(psql(`select count(*) from platform.ai_provider_routing_events`), "0", "no events seeded");

      console.log("Verifying Alice (not a superadmin) can read the open policy but can't change it...");
      assertEqual(psqlAsAlice(`select count(*) from platform.ai_provider_routing`), "1", "Alice can read the singleton row");
      assertThrows(
        () =>
          psqlAsAlice(
            `select platform.update_ai_provider_routing('openai', 'gpt-5.4', '{}'::jsonb, 'anthropic', 'trying to change routing')`,
          ),
        "Alice's routing-update attempt is rejected by the function's own internal check",
      );
      assertEqual(
        psql(`set local role service_role; select default_provider is null from platform.ai_provider_routing`).toString(),
        "t",
        "the policy is untouched by Alice's rejected attempt",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.ai_provider_routing_events`), "0", "zero residue in the audit trail");

      console.log("Verifying a genuine superadmin (Zoe) can set the full policy...");
      psqlAsZoe(
        `select platform.update_ai_provider_routing('anthropic', 'claude-sonnet-5', '{"discovery": "google", "crm": "openai"}'::jsonb, 'openai', 'initial platform-wide routing policy')`,
      );
      assertEqual(
        psqlAsZoe(
          `select default_provider || ':' || default_model || ':' || fallback_provider || ':' || (module_overrides ->> 'discovery') || ':' || (module_overrides ->> 'crm') from platform.ai_provider_routing`,
        ),
        "anthropic:claude-sonnet-5:openai:google:openai",
        "the policy was updated with the exact values requested",
      );
      assertEqual(
        psqlAsZoe(
          `select (previous_value ->> 'default_provider' is null)::text || ':' || (new_value ->> 'default_provider') from platform.ai_provider_routing_events order by performed_at desc limit 1`,
        ),
        "true:anthropic",
        "exactly one audit event with a real before/after snapshot",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.ai_provider_routing_events`), "1", "exactly one event so far");

      console.log("Verifying an unknown default/fallback provider is rejected, with zero residue...");
      assertThrows(
        () =>
          psqlAsZoe(`select platform.update_ai_provider_routing('cohere', null, '{}'::jsonb, 'openai', 'unknown default provider')`),
        "an unknown default_provider is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(`select platform.update_ai_provider_routing('openai', null, '{}'::jsonb, 'cohere', 'unknown fallback provider')`),
        "an unknown fallback_provider is rejected",
      );
      assertEqual(
        psqlAsZoe(`select default_provider from platform.ai_provider_routing`),
        "anthropic",
        "the policy is untouched by the two rejected attempts above",
      );

      console.log("Verifying an unknown module key / unknown provider inside module_overrides is rejected...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_provider_routing('anthropic', null, '{"not_a_real_module": "openai"}'::jsonb, 'openai', 'unknown module key')`,
          ),
        "an unknown module key inside module_overrides is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_provider_routing('anthropic', null, '{"discovery": "cohere"}'::jsonb, 'openai', 'unknown provider in override')`,
          ),
        "an unknown provider inside module_overrides is rejected",
      );
      assertEqual(
        psqlAsZoe(`select module_overrides ->> 'discovery' from platform.ai_provider_routing`),
        "google",
        "the policy's own module_overrides are untouched by the two rejected attempts above",
      );

      console.log("Verifying a non-object module_overrides value is rejected...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_provider_routing('anthropic', null, '["not", "an", "object"]'::jsonb, 'openai', 'array instead of object')`),
        "a JSON array for module_overrides is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_provider_routing('anthropic', null, '5'::jsonb, 'openai', 'scalar instead of object')`),
        "a JSON scalar for module_overrides is rejected",
      );

      console.log("Verifying an empty/whitespace reason is rejected...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_provider_routing('anthropic', null, '{}'::jsonb, 'openai', '')`),
        "an empty reason is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_provider_routing('anthropic', null, '{}'::jsonb, 'openai', '   ')`),
        "a whitespace-only reason is rejected",
      );

      console.log("Verifying clearing the policy back to nulls/empty is a valid, honest state...");
      psqlAsZoe(`select platform.update_ai_provider_routing(null, null, '{}'::jsonb, null, 'reverting to no policy while we reconsider')`);
      assertEqual(
        psqlAsZoe(
          `select coalesce(default_provider, 'null') || ':' || coalesce(fallback_provider, 'null') || ':' || module_overrides::text from platform.ai_provider_routing`,
        ),
        "null:null:{}",
        "the policy can be cleared back to an honest, unset state",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.ai_provider_routing_events`), "2", "the clear itself is also audited");

      console.log("Verifying read access to the audit trail: superadmin-only, unlike the open policy row...");
      assertEqual(psqlAsAlice(`select count(*) from platform.ai_provider_routing_events`), "0", "Alice gets zero rows from the audit trail (RLS-filtered, not an error)");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.ai_provider_routing_events`).toString(), "t", "Zoe (superadmin) can read it");

      console.log("Verifying nobody -- including a superadmin -- can bypass the function with a direct write...");
      assertThrows(
        () => psqlAsZoe(`update platform.ai_provider_routing set default_provider = 'openai' where id = true`),
        "even a superadmin cannot UPDATE platform.ai_provider_routing directly -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.ai_provider_routing (id, default_provider) values (false, 'openai')`),
        "even a superadmin cannot INSERT a second row -- no grant exists (and the boolean PK would reject it anyway)",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.ai_provider_routing where id = true`),
        "even a superadmin cannot DELETE the singleton row -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.ai_provider_routing_events (previous_value, new_value, reason) values ('{}'::jsonb, '{}'::jsonb, 'bypass attempt')`),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("\nAll platform.ai_provider_routing / platform.ai_provider_routing_events checks passed.");
    },
  });
}

main();
