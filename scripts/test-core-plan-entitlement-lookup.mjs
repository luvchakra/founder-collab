#!/usr/bin/env node
/**
 * Behavior test for the actual SQL composition PLATFORM-P0-05.2/05.3's
 * `getBusinessPlan()`/`hasFeature()`/`getLimit()` (packages/core/src/entitlements/) rely
 * on, as an ordinary authenticated business member: `core.business_settings.plan` (the
 * business's own key) joined against `platform.plans.key` (the FK target), then against
 * `platform.plan_features`/`platform.plan_limits` by the resolved `plan_id`. Every
 * individual table's own RLS is already covered by its own sibling test script -- this
 * one is specifically about the join chain working end-to-end for a non-superadmin
 * caller, now that `20260912080000_platform_catalog_authenticated_read.sql` (this same
 * story) opened SELECT on the plan catalog to any authenticated user.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "66666666-6666-6666-6666-666666666661";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_plan_entitlement_lookup_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual }) => {
      const as = (sql) => psqlAs(ALICE, sql);

      console.log("Seeding a business, a feature, and a plan_limits row...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-plan-lookup@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema discovery to authenticated;
        grant select, insert, update, delete on all tables in schema discovery to authenticated;
      `);
      const business = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role) values ('${business}', '${ALICE}', 'owner');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, '${business}', 'discovery', 'active' from core.businesses where id = '${business}';
      `);

      console.log("getBusinessPlan()'s own join chain: business_settings.plan -> plans.key...");
      assertEqual(as(`select plan from core.business_settings where business_id = '${business}'`), "free", "the business defaults to the free plan (this section's own plan-link story)");
      const freePlanId = as(`select id from platform.plans where key = 'free'`);
      assertEqual(as(`select id from platform.plans where key = (select plan from core.business_settings where business_id = '${business}')`), freePlanId, "the join Alice's own client would run resolves to a real plan id");

      console.log("hasFeature()'s own join chain: plans.id -> features(module_key,key) -> plan_features...");
      const featureId = psql(`
        set local role service_role;
        insert into platform.features (module_key, key, name) values ('discovery', 'advanced_signals', 'Advanced Signals') returning id;
      `);
      assertEqual(as(`select count(*) from platform.plan_features where plan_id = '${freePlanId}' and feature_id = '${featureId}'`), "0", "no entitlement row yet -- Alice's free plan does not include it");
      psql(`set local role service_role; insert into platform.plan_features (plan_id, feature_id, enabled) values ('${freePlanId}', '${featureId}', true);`);
      assertEqual(
        as(`select enabled from platform.plan_features where plan_id = '${freePlanId}' and feature_id = '${featureId}'`),
        "t",
        "Alice's own client (not a superadmin) can read the entitlement once it exists",
      );

      console.log("getLimit()'s own join chain: plans.id -> plan_limits(resource_key)...");
      psql(`set local role service_role; insert into platform.plan_limits (plan_id, resource_key, state, limit_value) values ('${freePlanId}', 'businesses', 'limited', 1);`);
      assertEqual(
        as(`select state, limit_value from platform.plan_limits where plan_id = '${freePlanId}' and resource_key = 'businesses'`),
        "limited|1",
        "Alice's own client can read the configured limit for her own plan",
      );
      assertEqual(
        as(`select count(*) from platform.plan_limits where plan_id = '${freePlanId}' and resource_key = 'contacts'`),
        "0",
        "an unconfigured resource has no row -- getLimit() treats this as unrestricted, per its own docstring",
      );

      console.log("\nAll plan-entitlement join-chain checks passed.");
    },
  });
}

main();
