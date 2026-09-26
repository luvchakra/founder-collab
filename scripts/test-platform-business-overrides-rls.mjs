#!/usr/bin/env node
/**
 * RLS + behaviour test for PLATFORM-P1-02.1/02.2/02.3 (business overrides,
 * 20260927201000_platform_business_overrides.sql) and PLATFORM-P0-10.4 (AI feature kill
 * switch, 20260927200000_platform_ai_operation_switches.sql).
 *
 * What this proves:
 *   - a business's overrides are visible to its own members and superadmins, and to no
 *     other tenant; nobody can write the table directly;
 *   - only a superadmin can grant or revoke, a reason and an expiry are mandatory, and both
 *     writes land in platform.audit_log with the reason (02.3);
 *   - core.try_consume_usage_counter() honours an active limit override, ignores a revoked
 *     or expired one, and is unchanged for a business with none;
 *   - AI feature switches are readable by any signed-in user, settable only by a superadmin
 *     with a reason, and every switch is audited.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-99999999a0a1";
const BOB = "99999999-9999-9999-9999-99999999b0b1";
const ZOE = "99999999-9999-9999-9999-99999999c0c1";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_overrides_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-ov@example.com'), ('${BOB}', 'bob-ov@example.com'), ('${ZOE}', 'zoe-ov@example.com');
      `);
      const aliceBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;
      `);
      psql(`insert into core.business_members (business_id, user_id, role) values ('${aliceBiz}', '${ALICE}', 'owner') on conflict do nothing`);
      const bobBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;
      `);
      psql(`insert into core.business_members (business_id, user_id, role) values ('${bobBiz}', '${BOB}', 'owner') on conflict do nothing`);
      psql(`set local role service_role; insert into platform.admins (user_id) values ('${ZOE}');`);
      const pro = psql(`select id from platform.plans where key = 'pro'`);
      psql(`update core.business_settings set plan = 'pro' where business_id in ('${aliceBiz}', '${bobBiz}')`);
      psql(`insert into platform.plan_limits (plan_id, resource_key, state, limit_value, limit_type) values ('${pro}', 'prospects', 'limited', 2, 'hard')`);
      psql(`insert into platform.features (module_key, key, name) values ('discovery', 'advanced_signals', 'Advanced Signals')`);

      console.log("Granting is superadmin-only, reasoned and time-boxed...");
      const grant = (who, reason, expiry = "now() + interval '30 days'") =>
        psqlAs(who, `select platform.create_business_override('${aliceBiz}', 'limit', null, null, 'prospects', 3, null, ${expiry}, ${reason})`);
      assertThrows(() => grant(ALICE, "'please'"), "a business owner can't grant herself an exception");
      assertThrows(() => grant(ZOE, "'  '"), "a reason is required");
      assertThrows(() => grant(ZOE, "'pilot'", "null"), "an expiry is required");
      assertThrows(() => grant(ZOE, "'pilot'", "now() - interval '1 day'"), "expiry must be after start");
      assertThrows(
        () => psqlAs(ALICE, `insert into platform.business_overrides (business_id, override_type, resource_key, reason, created_by, expires_at) values ('${aliceBiz}', 'limit', 'prospects', 'x', '${ALICE}', now() + interval '1 day')`),
        "nobody can insert an override directly",
      );
      const overrideId = grant(ZOE, "'Enterprise pilot'");
      assertEqual(
        psql(`select created_by || ':' || reason from platform.business_overrides where id = '${overrideId}'`),
        `${ZOE}:Enterprise pilot`,
        "created_by is the signed-in superadmin",
      );
      assertEqual(
        psql(`select count(*) from platform.audit_log where resource_type = 'business_override' and action = 'created' and reason = 'Enterprise pilot' and actor_id = '${ZOE}'`),
        "1",
        "the grant is audited with its reason (02.3)",
      );
      assertThrows(
        () => psqlAs(ZOE, `select platform.create_business_override('${aliceBiz}', 'feature', 'discovery', 'nope', null, null, null, now() + interval '1 day', 'x')`),
        "a feature override must name a real feature",
      );
      psqlAs(ZOE, `select platform.create_business_override('${aliceBiz}', 'feature', 'discovery', 'advanced_signals', null, null, null, now() + interval '1 day', 'trial of signals')`);

      console.log("Tenant isolation...");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.business_overrides`), "2", "the business's own member sees its overrides");
      assertEqual(psqlAs(BOB, `select count(*) from platform.business_overrides`), "0", "another tenant sees none");
      assertEqual(psqlAs(ZOE, `select count(*) from platform.business_overrides`), "2", "a superadmin sees all");
      assertThrows(() => psqlAs(ALICE, `update platform.business_overrides set limit_value = 99999`), "a member can't edit an override");
      assertThrows(() => psqlAs(ZOE, `delete from platform.business_overrides`), "overrides are never deleted, even by a superadmin");

      console.log("Enforcement in try_consume_usage_counter...");
      const consume = (who, biz) =>
        psqlAs(who, `select state || ':' || coalesce(limit_value::text, '-') || ':' || granted from core.try_consume_usage_counter('${biz}', 'prospects', 1)`);
      assertEqual(consume(ALICE, aliceBiz), "limited:3:true", "the override's limit (3) replaces the plan's (2) -- 1st");
      consume(ALICE, aliceBiz);
      assertEqual(consume(ALICE, aliceBiz), "limited:3:true", "3rd consumption fits the temporary limit");
      assertEqual(consume(ALICE, aliceBiz), "limited:3:false", "4th is refused at the temporary limit");
      consume(BOB, bobBiz);
      consume(BOB, bobBiz);
      assertEqual(consume(BOB, bobBiz), "limited:2:false", "a business without an override keeps its plan limit");

      console.log("Revocation...");
      assertThrows(() => psqlAs(ALICE, `select platform.revoke_business_override('${overrideId}', 'mine')`), "a member can't revoke");
      assertThrows(() => psqlAs(ZOE, `select platform.revoke_business_override('${overrideId}', '')`), "revoking needs a reason");
      psqlAs(ZOE, `select platform.revoke_business_override('${overrideId}', 'pilot ended')`);
      assertEqual(
        psql(`select (revoked_at is not null)::text || ':' || revoke_reason || ':' || revoked_by from platform.business_overrides where id = '${overrideId}'`),
        `true:pilot ended:${ZOE}`,
        "revocation is stamped, not deleted",
      );
      assertEqual(
        psql(`select count(*) from platform.audit_log where resource_type = 'business_override' and action = 'updated' and reason = 'pilot ended'`),
        "1",
        "the revocation is audited",
      );
      assertEqual(consume(ALICE, aliceBiz), "limited:2:false", "after revocation the plan limit applies again");
      assertThrows(() => psqlAs(ZOE, `select platform.revoke_business_override('${overrideId}', 'again')`), "an override can't be revoked twice");
      psql(`
        insert into platform.business_overrides (business_id, override_type, resource_key, limit_value, reason, created_by, starts_at, expires_at)
        values ('${bobBiz}', 'limit', 'prospects', 50, 'old', '${ZOE}', now() - interval '10 days', now() - interval '1 day');
      `);
      assertEqual(consume(BOB, bobBiz), "limited:2:false", "an expired override is ignored");
      psql(`
        insert into platform.business_overrides (business_id, override_type, resource_key, limit_value, reason, created_by, expires_at)
        values ('${bobBiz}', 'limit', 'prospects', null, 'unlimited pilot', '${ZOE}', now() + interval '1 day');
      `);
      assertEqual(consume(BOB, bobBiz), "unlimited:-:true", "a null-limit override means unlimited");

      console.log("AI feature kill switch (PLATFORM-P0-10.4)...");
      assertThrows(() => psqlAs(ALICE, `select platform.set_ai_operation_enabled('chat', false, 'no')`), "a customer can't switch an AI feature");
      assertThrows(() => psqlAs(ZOE, `select platform.set_ai_operation_enabled('chat', false, ' ')`), "a reason is required");
      assertThrows(() => psqlAs(ZOE, `insert into platform.ai_operation_switches (operation, enabled, reason) values ('chat', false, 'x')`), "no direct writes");
      psqlAs(ZOE, `select platform.set_ai_operation_enabled('chat', false, 'provider outage')`);
      assertEqual(psqlAs(ALICE, `select enabled from platform.ai_operation_switches where operation = 'chat'`), "f", "any signed-in user can read the switch");
      psqlAs(ZOE, `select platform.set_ai_operation_enabled('chat', true, 'recovered')`);
      assertEqual(
        psql(`select string_agg(action || ':' || reason, ',' order by performed_at) from platform.audit_log where resource_type = 'ai_operation_switch'`),
        "created:provider outage,updated:recovered",
        "each switch is audited with its reason",
      );

      console.log("\nAll business override and AI kill switch checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
