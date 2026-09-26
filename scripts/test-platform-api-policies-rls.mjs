#!/usr/bin/env node
/**
 * RLS + behaviour test for PLATFORM-P1-06.1/06.2/06.3/06.4
 * (20260927203000_platform_api_policies.sql).
 *
 * What this proves:
 *   - API/webhook policy is superadmin-only to read and change, needs a reason, is range
 *     checked, and every change is in platform.audit_log;
 *   - core.check_api_burst_limit() counts per business per second and is service-role only;
 *     core.api_burst_counters is invisible to signed-in users;
 *   - API error counters are aggregate-only, superadmin-readable, written only by the
 *     service role;
 *   - a superadmin can revoke any business's API key with an audited reason; a business
 *     owner can't use that path, and the audit row never holds the key hash;
 *   - api_usage_daily() aggregates per business per day and refuses non-superadmins.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-99999999e0a1";
const BOB = "99999999-9999-9999-9999-99999999e0b1";
const ZOE = "99999999-9999-9999-9999-99999999e0c1";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_api_policies_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`insert into auth.users (id, email) values ('${ALICE}', 'a-api@example.com'), ('${BOB}', 'b-api@example.com'), ('${ZOE}', 'z-api@example.com')`);
      const aliceBiz = psql(`insert into core.businesses (account_id, name) select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id`);
      psql(`insert into core.business_members (business_id, user_id, role) values ('${aliceBiz}', '${ALICE}', 'owner') on conflict do nothing`);
      const bobBiz = psql(`insert into core.businesses (account_id, name) select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id`);
      psql(`set local role service_role; insert into platform.admins (user_id) values ('${ZOE}');`);

      console.log("API and webhook policy...");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.api_policies`), "0", "a customer can't read the policy");
      assertEqual(psqlAs(ZOE, `select burst_limit_per_second || ':' || webhook_max_retries from platform.api_policies`), "20:8", "defaults match today's behaviour");
      assertThrows(() => psqlAs(ALICE, `select platform.update_api_policies(1, 1, 1, 60, 30, 'x')`), "a customer can't change it");
      assertThrows(() => psqlAs(ZOE, `select platform.update_api_policies(10, 256, 5, 600, 300, ' ')`), "a reason is required");
      assertThrows(() => psqlAs(ZOE, `select platform.update_api_policies(0, 256, 5, 600, 300, 'x')`), "burst must be at least 1");
      assertThrows(() => psqlAs(ZOE, `select platform.update_api_policies(10, 256, 5, 600, 5, 'x')`), "signature window has a floor");
      psqlAs(ZOE, `select platform.update_api_policies(10, 256, 5, 900, 120, 'tighten')`);
      assertEqual(
        psql(`select count(*) from platform.audit_log where resource_type = 'api_policies' and reason = 'tighten' and (new_value->>'burst_limit_per_second') = '10'`),
        "1",
        "the change is audited",
      );
      assertThrows(() => psqlAs(ZOE, `update platform.api_policies set burst_limit_per_second = 999`), "no direct writes");

      console.log("Burst counting...");
      assertThrows(() => psqlAs(ALICE, `select core.check_api_burst_limit('${aliceBiz}', 2)`), "a signed-in user can't call the burst check");
      assertEqual(
        psql(`set local role service_role; select concat_ws(',', core.check_api_burst_limit('${aliceBiz}', 2), core.check_api_burst_limit('${aliceBiz}', 2), core.check_api_burst_limit('${aliceBiz}', 2))`),
        "t,t,f",
        "the third request inside one second is over a burst limit of 2",
      );
      assertEqual(psql(`set local role service_role; select core.check_api_burst_limit('${bobBiz}', 2)`), "t", "another business has its own window");
      assertEqual(psqlAs(ALICE, `select count(*) from core.api_burst_counters`), "0", "burst counters are invisible to users");

      console.log("API error counters...");
      assertThrows(() => psqlAs(ALICE, `select platform.record_api_error(500)`), "a user can't write error counters");
      psql(`set local role service_role; select platform.record_api_error(500); select platform.record_api_error(500); select platform.record_api_error(429);`);
      assertEqual(psqlAs(ZOE, `select sum(error_count) from platform.api_error_counters`), "3", "a superadmin sees the aggregate");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.api_error_counters`), "0", "a customer doesn't");

      console.log("Platform revoke of a business API key...");
      const key = psql(`
        insert into core.api_keys (business_id, name, key_prefix, permissions, created_by)
        values ('${aliceBiz}', 'Zapier', 'sk_live_ab12', array['products.read'], '${ALICE}') returning id;
      `);
      psql(`insert into core.api_key_secrets (api_key_id, key_hash) values ('${key}', 'HASH-SHOULD-NEVER-LEAK')`);
      assertThrows(() => psqlAs(ALICE, `select platform.revoke_business_api_key('${key}', 'mine')`), "a business owner can't use the platform revoke");
      assertThrows(() => psqlAs(ZOE, `select platform.revoke_business_api_key('${key}', '')`), "a reason is required");
      psqlAs(ZOE, `select platform.revoke_business_api_key('${key}', 'leaked in a public repo')`);
      assertEqual(psql(`select revoked_at is not null from core.api_keys where id = '${key}'`), "t", "the key is revoked");
      assertEqual(psql(`select count(*) from core.api_keys where id = '${key}'`), "1", "and kept, not deleted");
      assertEqual(
        psql(`select count(*) from platform.audit_log where resource_type = 'api_key' and reason = 'leaked in a public repo'`),
        "1",
        "the revoke is audited",
      );
      assertEqual(psql(`select count(*) from platform.audit_log where new_value::text like '%HASH-SHOULD-NEVER-LEAK%' or previous_value::text like '%HASH-SHOULD-NEVER-LEAK%'`), "0", "the audit row never holds the key hash");
      assertThrows(() => psqlAs(ZOE, `select platform.revoke_business_api_key('${key}', 'again')`), "can't revoke twice");

      console.log("Usage aggregate...");
      psql(`
        insert into core.api_rate_limit_counters (business_id, window_start, request_count)
        values ('${aliceBiz}', date_trunc('minute', now()), 130), ('${aliceBiz}', date_trunc('minute', now()) - interval '1 minute', 5),
               ('${bobBiz}', date_trunc('minute', now()), 7);
      `);
      assertThrows(() => psqlAs(ALICE, `select * from platform.api_usage_daily(7)`), "a customer can't read platform usage");
      assertEqual(
        psqlAs(ZOE, `select requests || ':' || rate_limited from platform.api_usage_daily(7) where business_id = '${aliceBiz}'`),
        "135:10",
        "requests per business per day, and how many were over the 120/minute limit",
      );

      console.log("\nAll platform API administration checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
