#!/usr/bin/env node
/**
 * DB test for the vendor console's data (PLATFORM-P1-10.6 / 10.11 / 10.12 / 10.13, migration
 * 20261013110000):
 *   - organization details are vendor-only (no client access), validated by the database too,
 *     belong to the organization (not an environment), and are audited;
 *   - one plan per organization, applied to every environment, never over a provider-billed one;
 *   - private notes keep only their length in the audit;
 *   - an announcement for one organization is visible to that organization's members only,
 *     created by a superadmin only; End now ends it once, keeps the record, and switches off a
 *     notice that hasn't started yet.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-8888888888b1";
const BOB = "88888888-8888-8888-8888-8888888888b2";
const ZOE = "88888888-8888-8888-8888-8888888888b3"; // superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "organization_console_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-console@example.com'), ('${BOB}', 'bob-console@example.com'), ('${ZOE}', 'zoe-console@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const sr = (sql) => psql(`set local role service_role; ${sql}`);
      sr(`insert into platform.admins (user_id) values ('${ZOE}')`);
      const newBusiness = (user, name) => {
        const id = psqlAs(user, `insert into core.businesses (account_id, name) select account_id, '${name}' from core.account_members where user_id = '${user}' returning id;`);
        psql(`insert into core.business_members (business_id, user_id, role, role_id, status) values ('${id}', '${user}', 'owner', (select id from core.roles where business_id is null and key = 'owner'), 'active') on conflict (business_id, user_id) do nothing`);
        return id;
      };
      const acme = newBusiness(ALICE, "Acme");
      const bobCo = newBusiness(BOB, "Bob Co");
      const acmeTest = sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'test')`);
      const acmeStaging = sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'staging')`);

      console.log("Verifying organization details...");
      assertThrows(() => psqlAs(ALICE, `select * from platform.organization_profiles`), "no client access to details");
      assertThrows(() => psqlAs(ZOE, `select platform.save_organization_profile('${ZOE}', '${acme}', '{}'::jsonb)`), "not callable by a client, even a superadmin's session");
      sr(`select platform.save_organization_profile('${ZOE}', '${acme}', '{"contact_name":"Ann","contact_email":"ann@acme.example","country":"IN","user_base_size":"51-200","website":"https://acme.example"}'::jsonb)`);
      assertEqual(sr(`select contact_name || '|' || country || '|' || user_base_size from platform.organization_profiles where business_id = '${acme}'`), "Ann|IN|51-200", "saved");
      assertThrows(() => sr(`select platform.save_organization_profile('${ZOE}', '${acme}', '{"contact_email":"not-an-email"}'::jsonb)`), "a bad email is refused by the database");
      assertThrows(() => sr(`select platform.save_organization_profile('${ZOE}', '${acme}', '{"country":"india"}'::jsonb)`), "a bad country is refused");
      assertThrows(() => sr(`select platform.save_organization_profile('${ZOE}', '${acme}', '{"user_base_size":"lots"}'::jsonb)`), "an unknown user base size is refused");
      assertThrows(() => sr(`select platform.save_organization_profile('${ZOE}', '${acmeTest}', '{}'::jsonb)`), "details belong to the organization, not an environment");

      console.log("Verifying one plan per organization...");
      const pro = psql(`select id from platform.plans where key = 'pro'`);
      sr(`insert into platform.subscriptions (business_id, plan_id, provider, environment, provider_subscription_id, status) values ('${acmeStaging}', '${pro}', 'razorpay', 'live', 'sub_live_1', 'active')`);
      assertEqual(
        sr(`select string_agg(business_id::text || ':' || changed, ',' order by changed, business_id) from platform.set_organization_plan('${ZOE}', '${acme}', 'max')`).split(",").filter((r) => r.endsWith(":true")).length.toString(),
        "2",
        "the organization and its test environment change",
      );
      assertEqual(psql(`select string_agg(s.plan, ',' order by b.name) from core.businesses b join core.business_settings s on s.business_id = b.id where b.id in ('${acme}', '${acmeTest}', '${acmeStaging}')`), "max,free,max", "the provider-billed staging plan is untouched");
      assertThrows(() => sr(`select * from platform.set_organization_plan('${ZOE}', '${acmeTest}', 'pro')`), "the plan is changed on the organization, not an environment");
      assertThrows(() => sr(`select * from platform.set_organization_plan('${ZOE}', '${acme}', 'nope')`), "an unknown plan is refused");
      const acmeDev = sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'development')`);
      assertEqual(psql(`select plan from core.business_settings where business_id = '${acmeDev}'`), "max", "a new environment inherits the organization's plan");

      console.log("Verifying private notes...");
      sr(`select platform.set_business_notes('${ZOE}', '${acmeTest}', 'Pilot customer, call before suspending')`);
      assertEqual(sr(`select notes from platform.business_environments where business_id = '${acmeTest}'`), "Pilot customer, call before suspending", "saved");
      assertEqual(sr(`select new_value->>'length' from platform.audit_log where resource_type = 'business_notes' order by performed_at desc limit 1`), "38", "the audit keeps the length only");

      console.log("Verifying announcements for one organization...");
      assertThrows(() => psqlAs(ALICE, `select platform.create_business_announcement('information', 'Hi', 'Hello', '${acme}', null, null, 'x')`), "only a superadmin creates one");
      const note = psqlAs(ZOE, `select id from platform.create_business_announcement('warning', 'Acme maintenance', 'Planned work tonight', '${acme}', null, null, 'Planned work')`);
      psqlAs(ZOE, `select platform.create_announcement('information', 'Everyone', 'Hello all', 'all_customers', null, null, null, null, null, null, '{}', true, 'General notice')`);
      assertEqual(psqlAs(ALICE, `select count(*) from platform.announcements where id = '${note}'`), "1", "Acme's member sees Acme's notice");
      assertEqual(psqlAs(BOB, `select count(*) from platform.announcements where id = '${note}'`), "0", "Bob doesn't see Acme's notice");
      assertEqual(psqlAs(BOB, `select count(*) from platform.announcements where title = 'Everyone'`), "1", "everyone sees a notice for everyone");
      assertThrows(() => psql(`insert into platform.announcements (type, title, message, audience_type) values ('information', 'x', 'y', 'specific_business')`), "a business notice needs its business");

      console.log("Verifying End now...");
      assertThrows(() => psqlAs(ALICE, `select platform.end_announcement('${note}', 'done')`), "only a superadmin ends one");
      assertEqual(psqlAs(ZOE, `select platform.end_announcement('${note}', 'Work finished')`), "t", "ended");
      assertEqual(psqlAs(ZOE, `select platform.end_announcement('${note}', 'again')`), "f", "already ended");
      assertEqual(psql(`select count(*) from platform.announcements where id = '${note}' and expire_at <= now()`), "1", "the record is kept, ended");
      const future = psqlAs(ZOE, `select id from platform.create_business_announcement('information', 'Later', 'Next week', '${acme}', now() + interval '7 days', null, 'Heads-up')`);
      assertEqual(psqlAs(ZOE, `select platform.end_announcement('${future}', 'Cancelled')`), "t", "a future notice is ended too");
      assertEqual(psql(`select enabled from platform.announcements where id = '${future}'`), "f", "by switching it off");
      assertEqual(psql(`select count(*) from platform.announcement_events where announcement_id in ('${note}', '${future}')`), "4", "created and ended, both recorded");
      void bobCo;

      console.log("\nAll organization console checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
