#!/usr/bin/env node
/**
 * DB test for business limit overrides (PLATFORM-P1-02.1 / PLATFORM-P1-02.2 /
 * PLATFORM-P1-02.3, migration 20261010150000):
 *   - only a superadmin creates or revokes one, always with a reason and an expiry;
 *   - while active it replaces the plan's limit in core.try_consume_usage_counter() and
 *     platform.active_limit_override(), for that business only (tenant isolation);
 *   - before it starts, after it expires, or once revoked, the plan's limit applies again;
 *   - overlapping overrides are refused, rows can't be edited or written directly, and every
 *     create and revoke is in platform.audit_log at severity 'high'.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-888888888895"; // business owner, not a superadmin
const BOB = "88888888-8888-8888-8888-888888888896"; // another tenant
const ZOE = "88888888-8888-8888-8888-888888888897"; // superadmin

const create = (biz, args) => `select platform.create_business_limit_override('${biz}', ${args})`;
const consume = (biz) => `select state, limit_value, granted, overridden from core.try_consume_usage_counter('${biz}', 'prospects', 1, 'current')`;

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_business_overrides_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-override@example.com'),
          ('${BOB}', 'bob-override@example.com'),
          ('${ZOE}', 'zoe-override@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      psql(`set local role service_role; insert into platform.admins (user_id) values ('${ZOE}');`);
      const aliceBiz = psqlAs(ALICE, `insert into core.businesses (account_id, name) select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;`);
      const bobBiz = psqlAs(BOB, `insert into core.businesses (account_id, name) select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;`);
      const freePlanId = psql(`select id from platform.plans where key = 'free';`);
      psql(`set local role service_role; insert into platform.plan_limits (plan_id, resource_key, state, limit_value, limit_type) values ('${freePlanId}', 'prospects', 'limited', 1, 'hard');`);

      console.log("Verifying the plan's limit applies with no override...");
      assertEqual(psqlAs(ALICE, consume(aliceBiz)), "limited|1|t|f", "first prospect fits the free plan's limit of 1");
      assertEqual(psqlAs(ALICE, consume(aliceBiz)), "limited|1|f|f", "the second is refused by the plan");

      console.log("Verifying only a superadmin creates an override, with a reason and an expiry...");
      const window = `now() + interval '30 days'`;
      assertThrows(() => psqlAs(ALICE, create(aliceBiz, `'prospects', 'limited', 500, null, ${window}, 'Pilot'`)), "a business owner can't override their own limit");
      assertThrows(() => psqlAs(ZOE, create(aliceBiz, `'prospects', 'limited', 500, null, ${window}, '  '`)), "a blank reason is refused");
      assertThrows(() => psqlAs(ZOE, create(aliceBiz, `'prospects', 'limited', 500, null, null, 'Pilot'`)), "an override without an expiry is refused");
      assertThrows(() => psqlAs(ZOE, create(aliceBiz, `'prospects', 'limited', 500, null, now() + interval '400 days', 'Pilot'`)), "an override longer than a year is refused");
      assertThrows(() => psqlAs(ZOE, create(aliceBiz, `'prospects', 'limited', null, null, ${window}, 'Pilot'`)), "a limited override needs a number");
      assertThrows(() => psqlAs(ZOE, create(aliceBiz, `'no_such_resource', 'limited', 5, null, ${window}, 'Pilot'`)), "an unknown resource is refused");
      const overrideId = psqlAs(ZOE, create(aliceBiz, `'prospects', 'limited', 500, null, ${window}, 'Enterprise pilot'`));
      assertEqual(
        psql(`set local role service_role; select created_by, reason, starts_at <= now(), expires_at > now() + interval '29 days' from platform.business_limit_overrides where id = '${overrideId}'`),
        `${ZOE}|Enterprise pilot|t|t`,
        "created_by, reason, start and expiry are recorded",
      );

      console.log("Verifying the override replaces the plan's limit for that business only...");
      assertEqual(psqlAs(ALICE, consume(aliceBiz)), "limited|500|t|t", "Alice's business now gets 500");
      assertEqual(psqlAs(ALICE, `select state, limit_value from platform.active_limit_override('${aliceBiz}', 'prospects')`), "limited|500", "Alice can see her own active override");
      assertEqual(psqlAs(BOB, consume(bobBiz)), "limited|1|t|f", "Bob's business is still on the plan's limit");
      assertEqual(psqlAs(BOB, `select count(*) from platform.active_limit_override('${aliceBiz}', 'prospects')`), "0", "Bob can't see Alice's override");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.business_limit_overrides`), "0", "a business user can't read the override table (reasons stay with superadmins)");
      assertEqual(psqlAs(ZOE, `select count(*) from platform.business_limit_overrides`), "1", "a superadmin can");

      console.log("Verifying overlap, edit and direct-write refusals...");
      assertThrows(() => psqlAs(ZOE, create(aliceBiz, `'prospects', 'unlimited', null, now() + interval '10 days', now() + interval '40 days', 'Second'`)), "an overlapping override is refused");
      assertThrows(() => psqlAs(ZOE, `update platform.business_limit_overrides set limit_value = 900 where id = '${overrideId}'`), "a superadmin can't edit an override directly");
      assertThrows(() => psqlAs(ZOE, `delete from platform.business_limit_overrides where id = '${overrideId}'`), "or delete it");
      assertThrows(() => psqlAs(ZOE, `insert into platform.business_limit_overrides (business_id, resource_key, state, reason, starts_at, expires_at) values ('${aliceBiz}', 'users', 'unlimited', 'x', now(), now() + interval '1 day')`), "or insert one around the create function");
      assertThrows(() => psql(`set local role service_role; update platform.business_limit_overrides set limit_value = 900 where id = '${overrideId}'`), "even service_role can't edit an override");

      console.log("Verifying revoke restores the plan's limit, once, with a reason...");
      assertThrows(() => psqlAs(ALICE, `select platform.revoke_business_limit_override('${overrideId}', 'done')`), "a business owner can't revoke");
      assertThrows(() => psqlAs(ZOE, `select platform.revoke_business_limit_override('${overrideId}', '')`), "revoking needs a reason");
      psqlAs(ZOE, `select platform.revoke_business_limit_override('${overrideId}', 'Pilot ended early')`);
      assertThrows(() => psqlAs(ZOE, `select platform.revoke_business_limit_override('${overrideId}', 'again')`), "an override is revoked once");
      assertEqual(psqlAs(ALICE, consume(aliceBiz)), "limited|1|f|f", "after revoke the plan's limit applies again");

      console.log("Verifying expiry and future start need no job...");
      psql(`set local role service_role; insert into platform.business_limit_overrides (business_id, resource_key, state, reason, starts_at, expires_at, created_by) values ('${aliceBiz}', 'prospects', 'unlimited', 'Expired pilot', now() - interval '20 days', now() - interval '1 day', '${ZOE}')`);
      assertEqual(psqlAs(ALICE, consume(aliceBiz)), "limited|1|f|f", "an expired override has no effect");
      psqlAs(ZOE, create(aliceBiz, `'prospects', 'unlimited', null, now() + interval '5 days', now() + interval '10 days', 'Launch week'`));
      assertEqual(psqlAs(ALICE, consume(aliceBiz)), "limited|1|f|f", "a future override has no effect until it starts");

      console.log("Verifying every create and revoke is audited at high severity...");
      assertEqual(
        psql(`set local role service_role; select string_agg(action || ':' || coalesce(reason, ''), ',' order by performed_at, action) from platform.audit_log where resource_type = 'business_override' and severity = 'high'`),
        "created:Enterprise pilot,updated:Pilot ended early,created:Expired pilot,created:Launch week",
        "three creates and one revoke, each with its reason",
      );
      assertEqual(
        psql(`set local role service_role; select count(*) from platform.audit_log where resource_type = 'business_override' and actor_id = '${ZOE}'`),
        "3",
        "the superadmin is the recorded actor for the actions they took",
      );

      console.log("\nAll business limit override checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
