#!/usr/bin/env node
/**
 * DB test for owner self-service and paid environments (PLATFORM-P1-10.8 / 10.9 / 10.14,
 * migration 20261013120000):
 *   - only the organization's owner renames it (environments follow), disables or enables it
 *     (cascading) or one environment; a vendor suspension can't be lifted by the owner; an
 *     environment can't be enabled while its organization is off; the owner still sees a
 *     disabled organization; every owner action lands in core.audit_log;
 *   - creating an organization with a chosen address and environment needs account admin
 *     rights and a free, valid address;
 *   - environment orders: owners read their own only, nobody writes directly, one open order
 *     per organization and environment.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-8888888888c1"; // owner of Acme
const MEL = "88888888-8888-8888-8888-8888888888c2"; // a member of Acme, not an owner
const BOB = "88888888-8888-8888-8888-8888888888c3"; // another tenant
const ZOE = "88888888-8888-8888-8888-8888888888c4"; // superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "owner_organizations_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-owner@example.com'), ('${MEL}', 'mel-member@example.com'),
          ('${BOB}', 'bob-owner@example.com'), ('${ZOE}', 'zoe-owner@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const sr = (sql) => psql(`set local role service_role; ${sql}`);
      const aliceAccount = psql(`select account_id from core.account_members where user_id = '${ALICE}'`);
      const bobAccount = psql(`select account_id from core.account_members where user_id = '${BOB}'`);

      console.log("Verifying onboarding with an address and environment...");
      assertThrows(() => psqlAs(BOB, `select core.create_business_with_address('${aliceAccount}', 'Sneaky', 'sneaky-co', 'production')`), "not in someone else's account");
      assertThrows(() => psqlAs(ALICE, `select core.create_business_with_address('${aliceAccount}', 'Acme', 'admin', 'production')`), "a reserved address is refused");
      assertThrows(() => psqlAs(ALICE, `select core.create_business_with_address('${aliceAccount}', 'Acme', 'acme', 'sandbox')`), "sandbox is the vendor's only");
      const acme = psqlAs(ALICE, `select core.create_business_with_address('${aliceAccount}', 'Acme', 'acme', 'production')`);
      assertEqual(psql(`select s.slug || '|' || m.role || '|' || m.status from core.business_settings s join core.business_members m on m.business_id = s.business_id where s.business_id = '${acme}'`), "acme|owner|active", "the chosen address, the creator owns it");
      assertThrows(() => psqlAs(BOB, `select core.create_business_with_address('${bobAccount}', 'Acme Two', 'acme', 'production')`), "an address in use is refused");
      const bobDev = psqlAs(BOB, `select core.create_business_with_address('${bobAccount}', 'Bob Co', 'bob-co-dev', 'development')`);
      assertEqual(sr(`select environment from platform.business_environments where business_id = '${bobDev}'`), "development", "set up as a development environment");

      psql(`insert into core.business_members (business_id, user_id, role, role_id, status) values ('${acme}', '${MEL}', 'viewer', (select id from core.roles where business_id is null and key = 'viewer'), 'active')`);
      sr(`insert into platform.admins (user_id) values ('${ZOE}')`);
      const acmeTest = sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'test')`);

      console.log("Verifying ownership...");
      assertEqual(psqlAs(ALICE, `select core.is_organization_owner('${acmeTest}')`), "t", "owning the organization means owning its environments");
      assertEqual(psqlAs(MEL, `select core.is_organization_owner('${acme}')`), "f", "a member isn't an owner");
      assertEqual(psqlAs(BOB, `select core.is_organization_owner('${acme}')`), "f", "another tenant isn't an owner");
      assertEqual(psqlAs(ALICE, `select string_agg(slug, ',' order by slug) from core.my_managed_organizations() where business_id in ('${acme}', '${acmeTest}')`), "acme,acme-test", "the owner manages both");
      assertEqual(psqlAs(BOB, `select count(*) from core.my_managed_organizations() where business_id in ('${acme}', '${acmeTest}')`), "0", "Bob manages none of Acme");

      console.log("Verifying rename...");
      assertThrows(() => psqlAs(MEL, `select core.owner_rename_organization('${acme}', 'Mel Co')`), "a member can't rename");
      assertThrows(() => psqlAs(ALICE, `select core.owner_rename_organization('${acmeTest}', 'Just Test')`), "an environment isn't renamed alone");
      psqlAs(ALICE, `select core.owner_rename_organization('${acme}', 'Acme Global')`);
      assertEqual(psql(`select string_agg(name, ',' order by name) from core.businesses where id in ('${acme}', '${acmeTest}')`), "Acme Global,Acme Global (Test)", "environments follow");

      console.log("Verifying disable and enable...");
      assertThrows(() => psqlAs(MEL, `select core.owner_set_organization_disabled('${acme}', true)`), "a member can't disable");
      assertEqual(psqlAs(ALICE, `select count(*) from core.owner_set_organization_disabled('${acme}', true)`), "2", "the organization and its environment");
      assertEqual(psql(`select string_agg(status || ':' || disabled_by_owner, ',') from core.businesses where id in ('${acme}', '${acmeTest}')`), "suspended:true,suspended:true", "both disabled by the owner");
      assertEqual(psqlAs(ALICE, `select count(*) from core.my_managed_organizations() where business_id = '${acme}'`), "1", "the owner still sees a disabled organization");
      assertThrows(() => psqlAs(ALICE, `select core.owner_set_organization_disabled('${acmeTest}', false)`), "an environment can't be enabled while its organization is off");
      assertEqual(psqlAs(ALICE, `select count(*) from core.owner_set_organization_disabled('${acme}', false)`), "2", "re-enabled together");
      assertEqual(psqlAs(ALICE, `select count(*) from core.owner_set_organization_disabled('${acmeTest}', true)`), "1", "one environment alone");
      assertEqual(psql(`select status from core.businesses where id = '${acme}'`), "active", "the organization stays on");
      psqlAs(ALICE, `select core.owner_set_organization_disabled('${acmeTest}', false)`);

      console.log("Verifying a vendor suspension can't be lifted by the owner...");
      sr(`select platform.set_business_status('${ZOE}', '${acme}', 'suspended', 'Unpaid')`);
      assertThrows(() => psqlAs(ALICE, `select core.owner_set_organization_disabled('${acme}', false)`), "refused, with the reason");
      assertEqual(psql(`select status from core.businesses where id = '${acme}'`), "suspended", "still suspended");
      sr(`select platform.set_business_status('${ZOE}', '${acme}', 'active', null)`);

      console.log("Verifying owner actions are audited...");
      assertEqual(
        psql(`select count(*) >= 6 and bool_and(actor_id = '${ALICE}') from core.audit_log where action in ('organization.created', 'organization.renamed', 'organization.disabled', 'organization.enabled') and business_id in ('${acme}', '${acmeTest}')`),
        "t",
        "rename, disable and enable recorded with the owner as actor",
      );

      console.log("Verifying environment orders...");
      sr(`insert into platform.environment_orders (organization_id, environment, payment_mode, created_by) values ('${acme}', 'staging', 'test', '${ALICE}')`);
      assertThrows(() => sr(`insert into platform.environment_orders (organization_id, environment, payment_mode, created_by) values ('${acme}', 'staging', 'test', '${ALICE}')`), "one open order per organization and environment");
      assertEqual(psqlAs(ALICE, `select count(*) from platform.environment_orders`), "1", "the owner sees their order");
      assertEqual(psqlAs(MEL, `select count(*) from platform.environment_orders`), "0", "a member doesn't");
      assertEqual(psqlAs(BOB, `select count(*) from platform.environment_orders`), "0", "another tenant doesn't");
      assertThrows(() => psqlAs(ALICE, `insert into platform.environment_orders (organization_id, environment, payment_mode, created_by) values ('${acme}', 'development', 'test', '${ALICE}')`), "no direct writes");
      assertThrows(() => sr(`update platform.environment_orders set status = 'fulfilled' where organization_id = '${acme}'`), "fulfilled needs the environment and its time");
      sr(`update platform.environment_orders set status = 'failed', failure = 'Address taken' where organization_id = '${acme}'`);
      sr(`insert into platform.environment_orders (organization_id, environment, payment_mode, created_by) values ('${acme}', 'staging', 'test', '${ALICE}')`);
      assertEqual(sr(`select count(*) from platform.environment_orders where organization_id = '${acme}'`), "2", "after a failure, a new order can be placed");

      console.log("\nAll owner organization checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
