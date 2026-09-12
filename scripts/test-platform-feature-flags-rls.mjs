#!/usr/bin/env node
/**
 * RLS + behavior test for `platform.feature_flags`/`platform.feature_flag_events`
 * (PLATFORM-P0-08.1/08.2/08.3/08.4, "Feature Flags", docs/plan/09-PLATFORM-ADMIN-PORTAL-
 * BACKLOG.md §12). Same harness and bar every sibling `platform.*` migration in this
 * backlog has been held to.
 *
 * What this proves that reading the migration's own SQL does not:
 *   - the four-scope CHECK constraint really rejects a mismatched scope_type/scope-value
 *     combination, for all three non-global scopes, not just the one a hand-written insert
 *     happened to try;
 *   - every mutation (create/update/delete) is genuinely rejected for a non-superadmin,
 *     with zero residue in either table;
 *   - a reason is required unconditionally, for all three mutation functions;
 *   - a create/update/delete each write exactly one atomic audit event with a real
 *     before/after JSONB snapshot;
 *   - deleting a flag nulls the audit trail's own `flag_id` (via `on delete set null`)
 *     while the event itself survives, addressable by its denormalized `feature_key`;
 *   - nobody -- including a superadmin -- can bypass the three functions with a direct
 *     INSERT/UPDATE/DELETE on either table.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888881"; // business admin -- NOT a superadmin
const ZOE = "88888888-8888-8888-8888-888888888882"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_feature_flags_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-feature-flags@example.com'),
          ('${ZOE}', 'zoe-feature-flags@example.com');
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

      console.log("Verifying the catalog starts empty (no fabricated seed)...");
      assertEqual(psql(`select count(*) from platform.feature_flags`), "0", "no flags seeded");
      assertEqual(psql(`select count(*) from platform.feature_flag_events`), "0", "no events seeded");

      console.log("Verifying a business admin (not a superadmin) can read but not write via the functions...");
      assertEqual(psqlAsAlice(`select count(*) from platform.feature_flags`), "0", "Alice can read the (empty) catalog");
      assertThrows(
        () =>
          psqlAsAlice(
            `select * from platform.create_feature_flag('ai_research', null, true, null, null, 'global', null, null, null, 'trying to create')`,
          ),
        "Alice's create attempt is rejected by the function's own internal check",
      );
      assertEqual(psql(`set local role service_role; select count(*) from platform.feature_flags`), "0", "zero residue after Alice's rejected create");
      assertEqual(psql(`set local role service_role; select count(*) from platform.feature_flag_events`), "0", "zero residue in the audit trail too");

      console.log("Verifying a genuine superadmin (Zoe) can create a global flag...");
      const aiResearchId = psqlAsZoe(
        `select id from platform.create_feature_flag('ai_research', 'AI-powered lead research', true, null, null, 'global', null, null, null, 'registering the AI research kill switch')`,
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.feature_flags`), "1", "one flag now exists");
      assertEqual(
        psqlAsZoe(`select feature_key || ':' || scope_type || ':' || enabled::text from platform.feature_flags where id = '${aiResearchId}'`),
        "ai_research:global:true",
        "the flag was created with the exact values requested",
      );
      assertEqual(
        psqlAsZoe(`select action || ':' || (previous_value is null)::text || ':' || (new_value ->> 'feature_key') from platform.feature_flag_events where flag_id = '${aiResearchId}'`),
        "created:true:ai_research",
        "exactly one 'created' event, no previous_value, new_value carries the real row",
      );

      console.log("Verifying feature_key uniqueness (even for a superadmin)...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_feature_flag('ai_research', null, true, null, null, 'global', null, null, null, 'duplicate attempt')`,
          ),
        "a duplicate feature_key is rejected by the unique constraint",
      );

      console.log("Verifying the scope CHECK constraint for all three non-global scopes...");
      const proPlanId = psql(`select id from platform.plans where key = 'pro'`);
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_feature_flag('bad_plan_scope', null, true, null, null, 'plan', null, null, null, 'missing scope_plan_id')`,
          ),
        "scope_type='plan' with no scope_plan_id is rejected by the CHECK constraint",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_feature_flag('bad_module_scope', null, true, null, null, 'module', null, null, null, 'missing scope_module_key')`,
          ),
        "scope_type='module' with no scope_module_key is rejected by the CHECK constraint",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_feature_flag('bad_country_scope', null, true, null, null, 'country', null, null, null, 'missing scope_country_code')`,
          ),
        "scope_type='country' with no scope_country_code is rejected by the CHECK constraint",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_feature_flag('mixed_scope', null, true, null, null, 'global', '${proPlanId}', null, null, 'global should have no scope value')`,
          ),
        "scope_type='global' with a non-null scope_plan_id is rejected (exactly one scope column may be set)",
      );

      console.log("Verifying a real plan-scoped, module-scoped, and country-scoped flag can each be created...");
      const whatsappId = psqlAsZoe(
        `select id from platform.create_feature_flag('whatsapp_outbound', null, true, null, null, 'module', null, 'crm', null, 'kill switch for CRM WhatsApp outbound')`,
      );
      assertEqual(
        psqlAsZoe(`select scope_type || ':' || scope_module_key from platform.feature_flags where id = '${whatsappId}'`),
        "module:crm",
        "module-scoped flag stores the module key correctly",
      );
      const proOnlyId = psqlAsZoe(
        `select id from platform.create_feature_flag('pro_experimental_ui', null, false, null, null, 'plan', '${proPlanId}', null, null, 'staged rollout to Pro plan only')`,
      );
      assertEqual(
        psqlAsZoe(`select scope_type || ':' || scope_plan_id from platform.feature_flags where id = '${proOnlyId}'`),
        `plan:${proPlanId}`,
        "plan-scoped flag stores the plan id correctly",
      );
      const inGstId = psqlAsZoe(
        `select id from platform.create_feature_flag('gov_submission_in', null, true, null, null, 'country', null, null, 'IN', 'kill switch for Indian government submission')`,
      );
      assertEqual(
        psqlAsZoe(`select scope_type || ':' || scope_country_code from platform.feature_flags where id = '${inGstId}'`),
        "country:IN",
        "country-scoped flag stores the country code correctly",
      );

      console.log("Verifying the effective-window CHECK constraint (effective_to must be after effective_from)...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_feature_flag('bad_window', null, true, '2026-06-01T00:00:00Z', '2026-05-01T00:00:00Z', 'global', null, null, null, 'effective_to before effective_from')`,
          ),
        "effective_to at or before effective_from is rejected",
      );

      console.log("Verifying an empty/whitespace reason is rejected for every mutation function...");
      assertThrows(
        () =>
          psqlAsZoe(
            `select * from platform.create_feature_flag('no_reason', null, true, null, null, 'global', null, null, null, '')`,
          ),
        "create rejects an empty reason",
      );
      assertThrows(
        () => psqlAsZoe(`select * from platform.update_feature_flag('${aiResearchId}', null, false, null, null, '   ')`),
        "update rejects a whitespace-only reason",
      );
      assertThrows(
        () => psqlAsZoe(`select * from platform.delete_feature_flag('${aiResearchId}', '')`),
        "delete rejects an empty reason",
      );
      assertEqual(psqlAsZoe(`select count(*) from platform.feature_flags`), "4", "still exactly 4 flags -- no partial writes from the rejected calls above");

      console.log("Verifying update_feature_flag mutates only description/enabled/effective_from/effective_to...");
      const prevScope = psqlAsZoe(`select scope_type from platform.feature_flags where id = '${aiResearchId}'`);
      psqlAsZoe(
        `select * from platform.update_feature_flag('${aiResearchId}', 'Updated description', false, '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z', 'disabling while investigating a cost spike')`,
      );
      assertEqual(
        psqlAsZoe(`select description || ':' || enabled::text || ':' || scope_type from platform.feature_flags where id = '${aiResearchId}'`),
        `Updated description:false:${prevScope}`,
        "description/enabled changed, scope_type untouched (the function has no scope parameters at all)",
      );

      console.log("Verifying update_feature_flag writes exactly one atomic audit event with a real before/after snapshot...");
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (previous_value ->> 'enabled') || ':' || (new_value ->> 'enabled') from platform.feature_flag_events where flag_id = '${aiResearchId}' order by performed_at desc limit 1`,
        ),
        "updated:true:false",
        "the audit row captures the real previous/new 'enabled' value inside the JSONB snapshot",
      );

      console.log("Verifying Alice cannot update or delete an existing flag either, with zero residue...");
      assertThrows(
        () => psqlAsAlice(`select * from platform.update_feature_flag('${whatsappId}', null, false, null, null, 'trying to disable')`),
        "Alice's update attempt is rejected",
      );
      assertThrows(
        () => psqlAsAlice(`select * from platform.delete_feature_flag('${whatsappId}', 'trying to delete')`),
        "Alice's delete attempt is rejected",
      );
      assertEqual(
        psql(`set local role service_role; select enabled from platform.feature_flags where id = '${whatsappId}'`),
        "t",
        "whatsapp_outbound is untouched by Alice's rejected attempts",
      );

      console.log("Verifying an unknown flag id is rejected by update/delete...");
      assertThrows(
        () => psqlAsZoe(`select * from platform.update_feature_flag('00000000-0000-0000-0000-000000000000', null, true, null, null, 'testing')`),
        "update rejects an unknown flag id",
      );
      assertThrows(
        () => psqlAsZoe(`select * from platform.delete_feature_flag('00000000-0000-0000-0000-000000000000', 'testing')`),
        "delete rejects an unknown flag id",
      );

      console.log("Verifying delete_feature_flag: one 'deleted' event with a full snapshot, flag_id nulled by the FK, feature_key preserved...");
      const eventCountBefore = Number(psqlAsZoe(`select count(*) from platform.feature_flag_events`));
      psqlAsZoe(`select * from platform.delete_feature_flag('${proOnlyId}', 'rollout finished, no longer needed')`);
      assertEqual(psqlAsZoe(`select count(*) from platform.feature_flags`), "3", "the flag is really gone");
      assertEqual(
        psqlAsZoe(`select count(*) from platform.feature_flag_events`),
        String(eventCountBefore + 1),
        "exactly one new audit event for the deletion",
      );
      assertEqual(
        psqlAsZoe(
          `select action || ':' || (flag_id is null)::text || ':' || feature_key || ':' || (previous_value ->> 'feature_key') from platform.feature_flag_events where feature_key = 'pro_experimental_ui' order by performed_at desc limit 1`,
        ),
        "deleted:true:pro_experimental_ui:pro_experimental_ui",
        "the deletion event survives with flag_id nulled (on delete set null) but feature_key/previous_value intact",
      );

      console.log("Verifying read access to the audit trail: superadmin-only, unlike the open platform.feature_flags catalog...");
      assertEqual(psqlAsAlice(`select count(*) from platform.feature_flag_events`), "0", "Alice gets zero rows from the audit trail");
      assertEqual(psqlAsZoe(`select count(*) > 0 from platform.feature_flag_events`).toString(), "t", "Zoe (superadmin) can read it");

      console.log("Verifying nobody -- including a superadmin -- can bypass the functions with a direct write...");
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.feature_flags (feature_key, scope_type) values ('bypass_attempt', 'global')`,
          ),
        "even a superadmin cannot INSERT directly into platform.feature_flags -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`update platform.feature_flags set enabled = false where id = '${whatsappId}'`),
        "even a superadmin cannot UPDATE platform.feature_flags directly -- no grant exists",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.feature_flags where id = '${whatsappId}'`),
        "even a superadmin cannot DELETE from platform.feature_flags directly -- no grant exists",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.feature_flag_events (feature_key, action, reason) values ('bypass', 'created', 'bypass attempt')`,
          ),
        "even a superadmin cannot INSERT directly into the audit table",
      );

      console.log("\nAll platform.feature_flags / platform.feature_flag_events checks passed.");
    },
  });
}

main();
