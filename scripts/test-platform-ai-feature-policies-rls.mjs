#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.ai_feature_policies`/
 * `platform.ai_feature_policy_events` (PLATFORM-P0-09.4, "AI Feature Policies",
 * CONFIG-ONLY, docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §13; extended in place by
 * PLATFORM-P0-10.1's `monthly_budget_usd` column, §14, user-decided -- see
 * `20260912390000_platform_ai_feature_policies_monthly_budget.sql`). Same harness and bar
 * every sibling `platform.*` migration in this backlog has been held to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the singleton row is seeded with AI enabled, no provider/model restriction, and no
 *     token/cost/budget/monthly-budget ceiling -- no fabricated lockdown;
 *   - a non-superadmin can read the open policy row but her mutation attempt is rejected
 *     by the function's own internal check, with zero residue in either table;
 *   - a genuine superadmin can set the full policy (including the monthly budget), which
 *     writes exactly one atomic audit event carrying a real before/after snapshot;
 *   - an unknown provider inside `allowed_providers` is rejected, with zero residue;
 *   - a non-positive `max_tokens_per_run`/`max_run_cost_usd`/`daily_platform_budget_usd`/
 *     `monthly_budget_usd` is rejected by the table's own CHECK constraints;
 *   - an empty/whitespace reason is rejected;
 *   - clearing the policy back to no restriction/no ceiling is a valid, honest state;
 *   - the audit trail's own SELECT is superadmin-only;
 *   - nobody -- including a superadmin -- can bypass the function with a direct
 *     INSERT/UPDATE/DELETE on either table.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888895"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888896"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_ai_feature_policies_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-ai-policy@example.com'),
          ('${ZOE}', 'zoe-ai-policy@example.com');
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

      console.log("Verifying the singleton row starts seeded with no fabricated lockdown...");
      assertEqual(psql(`select count(*) from platform.ai_feature_policies`), "1", "exactly one feature-policy row exists");
      assertEqual(
        psql(
          `select ai_enabled::text || ':' || (array_length(allowed_providers, 1) is null)::text || ':' || (array_length(allowed_models, 1) is null)::text || ':' || (max_tokens_per_run is null)::text || ':' || (max_run_cost_usd is null)::text || ':' || (daily_platform_budget_usd is null)::text || ':' || (monthly_budget_usd is null)::text from platform.ai_feature_policies`,
        ),
        "true:true:true:true:true:true:true",
        "AI enabled, no provider/model restriction, no token/cost/budget/monthly-budget ceiling",
      );
      assertEqual(psql(`select count(*) from platform.ai_feature_policy_events`), "0", "no events seeded");

      console.log("Verifying Alice (not a superadmin) can read the open policy but can't change it...");
      assertEqual(psqlAsAlice(`select count(*) from platform.ai_feature_policies`), "1", "Alice can read the singleton row");
      assertThrows(
        () =>
          psqlAsAlice(
            `select platform.update_ai_feature_policies(false, array['openai']::text[], array[]::text[], null, null, null, null, 'trying to change policy')`,
          ),
        "Alice's policy-update attempt is rejected by the function's own internal check",
      );
      assertEqual(
        psql(`set local role service_role; select ai_enabled from platform.ai_feature_policies`).toString(),
        "t",
        "the policy is untouched by Alice's rejected attempt",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.ai_feature_policy_events`), "0", "zero residue in the audit trail");

      console.log("Verifying a genuine superadmin (Zoe) can set the full policy, including the monthly budget...");
      psqlAsZoe(
        `select platform.update_ai_feature_policies(true, array['anthropic', 'openai']::text[], array['claude-sonnet-5']::text[], 8000, 0.5, 100, 2500, 'initial platform-wide AI ceilings')`,
      );
      assertEqual(
        psqlAsZoe(
          `select ai_enabled::text || ':' || array_to_string(allowed_providers, ',') || ':' || array_to_string(allowed_models, ',') || ':' || max_tokens_per_run::text || ':' || max_run_cost_usd::text || ':' || daily_platform_budget_usd::text || ':' || monthly_budget_usd::text from platform.ai_feature_policies`,
        ),
        "true:anthropic,openai:claude-sonnet-5:8000:0.5000:100.00:2500.00",
        "the policy was updated with the exact values requested",
      );
      assertEqual(
        psqlAsZoe(
          `select (previous_value ->> 'max_tokens_per_run' is null)::text || ':' || (new_value ->> 'max_tokens_per_run') from platform.ai_feature_policy_events order by performed_at desc limit 1`,
        ),
        "true:8000",
        "exactly one audit event with a real before/after snapshot",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.ai_feature_policy_events`), "1", "exactly one event so far");

      console.log("Verifying an unknown provider inside allowed_providers is rejected, with zero residue...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_feature_policies(true, array['cohere']::text[], array[]::text[], null, null, null, null, 'unknown provider')`,
          ),
        "an unknown provider inside allowed_providers is rejected",
      );
      assertEqual(
        psqlAsZoe(`select array_to_string(allowed_providers, ',') from platform.ai_feature_policies`),
        "anthropic,openai",
        "the policy's own allowed_providers is untouched by the rejected attempt above",
      );

      console.log("Verifying non-positive token/cost/budget/monthly-budget ceilings are rejected by the table's own CHECK constraints...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], 0, null, null, null, 'zero tokens')`,
          ),
        "a zero max_tokens_per_run is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], null, -1, null, null, 'negative cost')`,
          ),
        "a negative max_run_cost_usd is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], null, null, 0, null, 'zero budget')`,
          ),
        "a zero daily_platform_budget_usd is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], null, null, null, 0, 'zero monthly budget')`,
          ),
        "a zero monthly_budget_usd is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], null, null, null, -50, 'negative monthly budget')`,
          ),
        "a negative monthly_budget_usd is rejected",
      );

      console.log("Verifying an empty/whitespace reason is rejected...");
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], null, null, null, null, '')`),
        "an empty reason is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`select platform.update_ai_feature_policies(true, array[]::text[], array[]::text[], null, null, null, null, '   ')`),
        "a whitespace-only reason is rejected",
      );

      console.log("Verifying clearing the policy back to no restriction/no ceiling is a valid, honest state...");
      psqlAsZoe(`select platform.update_ai_feature_policies(false, array[]::text[], array[]::text[], null, null, null, null, 'pausing AI while we reconsider limits')`);
      assertEqual(
        psqlAsZoe(
          `select ai_enabled::text || ':' || (array_length(allowed_providers, 1) is null)::text || ':' || (max_tokens_per_run is null)::text || ':' || (monthly_budget_usd is null)::text from platform.ai_feature_policies`,
        ),
        "false:true:true:true",
        "the policy can be cleared back to AI-disabled, no restriction, no ceiling, no monthly budget",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.ai_feature_policy_events`), "2", "the clear itself is also audited");

      console.log("Verifying read access to the audit trail: superadmin-only, unlike the open policy row...");
      assertEqual(psqlAsAlice(`select count(*) from platform.ai_feature_policy_events`), "0", "Alice gets zero rows from the audit trail (RLS-filtered, not an error)");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.ai_feature_policy_events`).toString(), "t", "Zoe (superadmin) can read it");

      console.log("Verifying nobody -- including a superadmin -- can bypass the function with a direct write...");
      assertThrows(
        () => psqlAsZoe(`update platform.ai_feature_policies set ai_enabled = true where id = true`),
        "even a superadmin cannot UPDATE platform.ai_feature_policies directly -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.ai_feature_policies (id, ai_enabled) values (false, true)`),
        "even a superadmin cannot INSERT a second row -- no grant exists (and the boolean PK would reject it anyway)",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.ai_feature_policies where id = true`),
        "even a superadmin cannot DELETE the singleton row -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.ai_feature_policy_events (previous_value, new_value, reason) values ('{}'::jsonb, '{}'::jsonb, 'bypass attempt')`),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("\nAll platform.ai_feature_policies / platform.ai_feature_policy_events checks passed.");
    },
  });
}

main();
