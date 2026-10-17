#!/usr/bin/env node
/**
 * DB test for PLATFORM-P1-08.2 ("Feature Rollout") and PLATFORM-P1-08.3 ("Rollback Flag"),
 * docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §30 -- migration
 * `20261017130000_platform_feature_flag_rollout.sql`.
 *
 * Proves:
 *   - only a platform superadmin can change a rollout or roll a flag back, and a reason
 *     is required for both, with zero residue on a refusal;
 *   - the SQL bucket matches the TypeScript bucket (`rolloutBucket()`) exactly;
 *   - stages are cumulative and evaluation is deterministic: allow-list wins at every
 *     stage, the percentage boundary is strict (bucket < percentage), Selected Plans adds
 *     businesses on the chosen plans, All turns it on for everyone;
 *   - rollback restores the saved known-good rollout, and with none saved turns the
 *     flag off; each writes one audited 'rolled_back' event;
 *   - evaluation fails closed: unknown flag, disabled flag, a business the caller does not
 *     belong to, and anonymous callers all answer false;
 *   - the existing scope still applies on top of the rollout.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";
import { createHash } from "node:crypto";

/** Same formula as `rolloutBucket()` in packages/core/src/admin/platform-feature-rollout.ts. */
function rolloutBucket(featureKey, businessId) {
  const hex = createHash("sha256").update(`${featureKey}:${businessId}`, "utf8").digest("hex");
  return parseInt(hex.slice(0, 8), 16) % 100;
}

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-8888-8888-8888-888888888881"; // business admin -- NOT a superadmin
const ZOE = "99999999-8888-8888-8888-888888888882"; // platform superadmin
const BOB = "99999999-8888-8888-8888-888888888883"; // a different business's admin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_feature_rollout_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asZoe = (sql) => psqlAs(ZOE, sql);
      const asBob = (sql) => psqlAs(BOB, sql);
      const asService = (sql) => psql(`set local role service_role; ${sql}`);

      console.log("Seeding users, a superadmin and a set of businesses...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'e2e-qa-alice-rollout@example.com'),
          ('${ZOE}', 'e2e-qa-zoe-rollout@example.com'),
          ('${BOB}', 'e2e-qa-bob-rollout@example.com');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);
      const aliceBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'e2e-qa Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      const bobBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'e2e-qa Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);
      // 40 more businesses under Zoe's account, to exercise the percentage.
      psql(`
        insert into core.businesses (account_id, name)
        select (select account_id from core.account_members where user_id = '${ZOE}'), 'e2e-qa biz ' || g
        from generate_series(1, 40) g;
      `);
      psql(`update core.business_settings set plan = 'pro' where business_id = '${bobBiz}'`);

      const flagId = asZoe(
        `select id from platform.create_feature_flag('new_editor', 'e2e-qa rollout flag', true, null, null, 'global', null, null, null, 'registering')`,
      );
      assertEqual(
        asZoe(`select rollout_stage || ':' || rollout_percentage from platform.feature_flags where id = '${flagId}'`),
        "all:0",
        "a new or existing flag defaults to All Customers -- behaviour unchanged",
      );

      console.log("Authorization: only a superadmin can change a rollout or roll back...");
      assertThrows(
        () => asAlice(`select platform.set_feature_flag_rollout('${flagId}', 'internal', 0, '{}', '{}', 'try')`),
        "a business admin cannot change a rollout",
      );
      assertThrows(
        () => asAlice(`select platform.rollback_feature_flag('${flagId}', 'try')`),
        "a business admin cannot roll a flag back",
      );
      assertThrows(
        () => psql(`set local role anon; select platform.set_feature_flag_rollout('${flagId}', 'internal', 0, '{}', '{}', 'try')`),
        "anon cannot even execute the rollout function",
      );
      assertThrows(
        () => asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'internal', 0, '{}', '{}', '  ')`),
        "a reason is required to change a rollout",
      );
      assertThrows(
        () => asZoe(`select platform.rollback_feature_flag('${flagId}', '')`),
        "a reason is required to roll back",
      );
      assertThrows(
        () => asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'internal', 0, array['00000000-0000-0000-0000-00000000dead']::uuid[], '{}', 'bad id')`),
        "an unknown business id is rejected",
      );
      assertThrows(
        () => asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'selected_plans', 0, '{}', array['nope'], 'bad plan')`),
        "an unknown plan key is rejected",
      );
      assertThrows(
        () => asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'pilot', 101, '{}', '{}', 'too much')`),
        "a percentage above 100 is rejected",
      );
      assertThrows(
        () => asZoe(`update platform.feature_flags set rollout_stage = 'internal' where id = '${flagId}'`),
        "no direct UPDATE grant, even for a superadmin",
      );
      assertEqual(
        asService(`select rollout_stage || ':' || count(*) from platform.feature_flags f join platform.feature_flag_events e on e.flag_id = f.id where f.id = '${flagId}' group by rollout_stage`),
        "all:1",
        "zero residue after every refusal (only the 'created' event exists)",
      );

      console.log("SQL bucket matches the TypeScript bucket...");
      const rows = asService(
        `select id || '|' || platform.feature_rollout_bucket('new_editor', id) from core.businesses order by id`,
      ).split("\n");
      for (const row of rows) {
        const [id, bucket] = row.split("|");
        assertEqual(bucket, String(rolloutBucket("new_editor", id)), `bucket for ${id} matches rolloutBucket()`);
      }

      console.log("Internal stage: only the named businesses...");
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'internal', 50, array['${aliceBiz}']::uuid[], array['pro'], 'internal dogfood')`);
      assertEqual(
        asZoe(`select rollout_percentage || ':' || cardinality(rollout_plan_keys) from platform.feature_flags where id = '${flagId}'`),
        "0:0",
        "Internal ignores a percentage and plans (normalised to 0 / none)",
      );
      assertEqual(asAlice(`select platform.is_feature_enabled_for_business('new_editor', '${aliceBiz}')`), "t", "Alice's allow-listed business is in");
      assertEqual(asBob(`select platform.is_feature_enabled_for_business('new_editor', '${bobBiz}')`), "f", "Bob's business is not");
      assertEqual(
        asService(`select count(*) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`),
        "1",
        "exactly one business has it at the Internal stage",
      );

      console.log("Pilot stage: allow-list + a deterministic percentage, strict boundary...");
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'pilot', 30, array['${aliceBiz}']::uuid[], '{}', 'pilot 30%')`);
      const expectedIn = rows.filter((r) => {
        const [id, bucket] = r.split("|");
        return id === aliceBiz || Number(bucket) < 30;
      }).length;
      const in30 = asService(
        `select string_agg(b.id::text, ',' order by b.id) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`,
      );
      assertEqual(String(in30.split(",").length), String(expectedIn), "pilot 30% = allow-list + every bucket < 30");
      assertEqual(
        asService(`select platform.is_feature_enabled_for_business('new_editor', '${aliceBiz}')`),
        "t",
        "allow-list wins regardless of the business's bucket",
      );
      assertEqual(
        asService(`select platform.is_feature_enabled_for_business('new_editor', '${aliceBiz}')`),
        "t",
        "the same answer on a second evaluation (deterministic)",
      );
      // Raising the percentage only adds businesses.
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'pilot', 60, array['${aliceBiz}']::uuid[], '{}', 'pilot 60%')`);
      const in60 = asService(
        `select string_agg(b.id::text, ',' order by b.id) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`,
      ).split(",");
      for (const id of in30.split(",")) {
        if (!in60.includes(id)) throw new Error(`business ${id} dropped out when the percentage went from 30 to 60`);
      }
      console.log("  ok   every business in at 30% stays in at 60% (stable in/out)");
      // Exact boundary for one business: bucket b is in at b+1 and out at b.
      const probe = rows.find((r) => r.split("|")[0] !== aliceBiz && Number(r.split("|")[1]) > 0 && Number(r.split("|")[1]) < 99);
      const [probeId, probeBucket] = probe.split("|");
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'pilot', ${probeBucket}, '{}', '{}', 'boundary')`);
      assertEqual(asService(`select platform.is_feature_enabled_for_business('new_editor', '${probeId}')`), "f", "percentage == bucket is out");
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'pilot', ${Number(probeBucket) + 1}, '{}', '{}', 'boundary + 1')`);
      assertEqual(asService(`select platform.is_feature_enabled_for_business('new_editor', '${probeId}')`), "t", "percentage == bucket + 1 is in");
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'pilot', 0, '{}', '{}', 'zero')`);
      assertEqual(
        asService(`select count(*) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`),
        "0",
        "pilot at 0% with no allow-list is off for everyone",
      );
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'pilot', 100, '{}', '{}', 'hundred')`);
      assertEqual(
        asService(`select count(*) = (select count(*) from core.businesses) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`),
        "t",
        "pilot at 100% is on for everyone",
      );

      console.log("Selected Plans stage adds businesses on the chosen plans...");
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'selected_plans', 0, array['${aliceBiz}']::uuid[], array['pro'], 'pro plans')`);
      assertEqual(asBob(`select platform.is_feature_enabled_for_business('new_editor', '${bobBiz}')`), "t", "Bob (on Pro) is in");
      assertEqual(asAlice(`select platform.is_feature_enabled_for_business('new_editor', '${aliceBiz}')`), "t", "Alice (allow-listed, Free) is in");
      assertEqual(
        asService(`select count(*) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`),
        "2",
        "only the allow-list and the Pro business at 0%",
      );

      console.log("Rollback restores the last known-good rollout...");
      asZoe(`select platform.set_feature_flag_rollout('${flagId}', 'all', 0, array['${aliceBiz}']::uuid[], array['pro'], 'go to everyone')`);
      assertEqual(
        asService(`select count(*) = (select count(*) from core.businesses) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`),
        "t",
        "All Customers is on for everyone",
      );
      asZoe(`select platform.rollback_feature_flag('${flagId}', 'errors after full rollout')`);
      assertEqual(
        asZoe(`select rollout_stage || ':' || array_to_string(rollout_plan_keys, ',') || ':' || (last_good_rollout is null)::text || ':' || enabled::text from platform.feature_flags where id = '${flagId}'`),
        "selected_plans:pro:true:true",
        "rollback restored Selected Plans (Pro), cleared the saved state, left the flag enabled",
      );
      assertEqual(
        asService(`select count(*) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`),
        "2",
        "after rollback only the Selected Plans audience has it again",
      );
      assertEqual(
        asZoe(`select action || ':' || (previous_value ->> 'rollout_stage') || ':' || (new_value ->> 'rollout_stage') || ':' || reason || ':' || (performed_by = '${ZOE}')::text from platform.feature_flag_events where flag_id = '${flagId}' order by performed_at desc, id desc limit 1`),
        "rolled_back:all:selected_plans:errors after full rollout:true",
        "one audited rolled_back event with before/after, reason and actor",
      );

      console.log("Rollback with no saved state turns the flag off (kill without a deploy)...");
      asZoe(`select platform.rollback_feature_flag('${flagId}', 'still broken')`);
      assertEqual(asZoe(`select enabled::text from platform.feature_flags where id = '${flagId}'`), "false", "flag is off");
      assertEqual(
        asService(`select count(*) from core.businesses b where platform.is_feature_enabled_for_business('new_editor', b.id)`),
        "0",
        "off for every business, allow-list included",
      );
      assertThrows(
        () => asZoe(`select platform.rollback_feature_flag('${flagId}', 'again')`),
        "nothing left to roll back is reported, not silently accepted",
      );
      assertEqual(
        asZoe(`select count(*) from platform.feature_flag_events where flag_id = '${flagId}' and action in ('rollout_changed', 'rolled_back')`),
        "11",
        "every rollout change and rollback wrote exactly one event",
      );
      assertEqual(
        asZoe(`select (platform.set_feature_flag_rollout('${flagId}', 'selected_plans', 0, array['${aliceBiz}']::uuid[], array['pro'], 'no-op')).id is not null`),
        "t",
        "re-saving the same rollout succeeds",
      );
      assertEqual(
        asZoe(`select count(*) from platform.feature_flag_events where flag_id = '${flagId}' and action in ('rollout_changed', 'rolled_back')`),
        "11",
        "...and writes no event, since nothing changed",
      );

      console.log("Fail closed and tenant isolation of the evaluation...");
      asZoe(`select platform.update_feature_flag('${flagId}', 'e2e-qa rollout flag', true, null, null, 're-enable')`);
      assertEqual(asAlice(`select platform.is_feature_enabled_for_business('new_editor', '${aliceBiz}')`), "t", "re-enabled: Alice is in again");
      assertEqual(
        asAlice(`select platform.is_feature_enabled_for_business('new_editor', '${bobBiz}')`),
        "f",
        "Alice cannot learn anything about Bob's business (false, not his real answer)",
      );
      assertEqual(asAlice(`select platform.is_feature_enabled_for_business('no_such_flag', '${aliceBiz}')`), "f", "unknown flag is off");
      assertEqual(
        asAlice(`select platform.is_feature_enabled_for_business('new_editor', '00000000-0000-0000-0000-00000000dead')`),
        "f",
        "unknown business is off",
      );
      assertEqual(asAlice(`select platform.is_feature_enabled_for_business('new_editor', null)`), "f", "null business is off");
      assertThrows(
        () => psql(`set local role anon; select platform.is_feature_enabled_for_business('new_editor', '${aliceBiz}')`),
        "anon cannot call the evaluation",
      );
      const futureId = asZoe(
        `select id from platform.create_feature_flag('future_thing', null, true, now() + interval '1 day', null, 'global', null, null, null, 'scheduled')`,
      );
      assertEqual(
        asService(`select platform.is_feature_enabled_for_business('future_thing', '${aliceBiz}')`),
        "f",
        `a flag outside its effective window is off (${futureId ? "created" : ""})`,
      );

      console.log("The flag's own scope still applies on top of the rollout...");
      const proPlanId = psql(`select id from platform.plans where key = 'pro'`);
      asZoe(
        `select platform.create_feature_flag('pro_only', null, true, null, null, 'plan', '${proPlanId}', null, null, 'pro scoped')`,
      );
      assertEqual(asService(`select platform.is_feature_enabled_for_business('pro_only', '${bobBiz}')`), "t", "Pro business is in a Pro-scoped flag");
      assertEqual(asService(`select platform.is_feature_enabled_for_business('pro_only', '${aliceBiz}')`), "f", "Free business is not");
      const crmFlag = asZoe(
        `select id from platform.create_feature_flag('crm_only', null, true, null, null, 'module', null, 'crm', null, 'crm scoped')`,
      );
      asZoe(`select platform.set_feature_flag_rollout('${crmFlag}', 'internal', 0, array['${aliceBiz}']::uuid[], '{}', 'internal')`);
      assertEqual(
        asService(`select platform.is_feature_enabled_for_business('crm_only', '${aliceBiz}')`),
        "f",
        "allow-listed but not licensed for the scoped module: still off",
      );
      assertEqual(
        asService(`select platform.is_feature_enabled_for_business('country_flag', '${aliceBiz}')`),
        "f",
        "no such flag: off",
      );
      asZoe(`select platform.create_feature_flag('in_only', null, true, null, null, 'country', null, null, 'IN', 'india')`);
      assertEqual(
        asService(`select platform.is_feature_enabled_for_business('in_only', '${aliceBiz}')`),
        "f",
        "country-scoped flag with no recorded country for the business: off (fail closed)",
      );
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
