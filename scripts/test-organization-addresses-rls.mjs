#!/usr/bin/env node
/**
 * DB test for organization addresses and environments (PLATFORM-P1-10.1 / 10.4 / 10.6 / 10.7,
 * migration 20261013100000):
 *   - address rules: 3-32 chars, lowercase, no double hyphen, reserved words refused; slugs are
 *     generated within them; members can't change a slug or a status directly;
 *   - core.resolve_business_host() works signed out and returns only the public face;
 *   - environments: created by the vendor only, suffixes never stack, production at the bare
 *     prefix, one of each kind, owners and plan copied, nothing else; the caller sees only
 *     their own businesses' environments (tenant isolation);
 *   - removing frees the address and keeps the data; vendor rename, address change and
 *     suspension work and every change is audited.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "88888888-8888-8888-8888-8888888888a1"; // owner of Acme
const BOB = "88888888-8888-8888-8888-8888888888a2"; // another tenant
const ZOE = "88888888-8888-8888-8888-8888888888a3"; // superadmin acting in the console

async function main() {
  await withTestDatabase({
    dbNamePrefix: "organization_addresses_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-org@example.com'), ('${BOB}', 'bob-org@example.com'), ('${ZOE}', 'zoe-org@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const sr = (sql) => psql(`set local role service_role; ${sql}`);
      const newBusiness = (user, name) =>
        psqlAs(user, `insert into core.businesses (account_id, name) select account_id, '${name}' from core.account_members where user_id = '${user}' returning id;`);
      const acme = newBusiness(ALICE, "Acme Corp");
      const bobCo = newBusiness(BOB, "Bob Co");
      // Business creation in the app adds the creator as owner (createBusiness()).
      psql(`insert into core.business_members (business_id, user_id, role, role_id, status)
            select b, u, 'owner', (select id from core.roles where business_id is null and key = 'owner'), 'active'
            from (values ('${acme}'::uuid, '${ALICE}'::uuid), ('${bobCo}'::uuid, '${BOB}'::uuid)) v(b, u)
            on conflict (business_id, user_id) do nothing`);

      console.log("Verifying address rules...");
      assertEqual(psql(`select core.business_slug_problem('acme')`), "", "a plain prefix is fine");
      for (const [slug, why] of [
        ["ab", "too short"],
        ["a".repeat(33), "too long"],
        ["Acme", "uppercase"],
        ["-acme", "leading hyphen"],
        ["acme--co", "double hyphen"],
        ["acme_co", "underscore"],
        ["www", "reserved"],
        ["dashboard", "reserved route"],
        ["staging", "reserved word"],
      ]) {
        assertEqual(psql(`select core.business_slug_problem('${slug}') is not null`), "t", `${slug} refused (${why})`);
      }
      assertEqual(psql(`select slug from core.business_settings where business_id = '${acme}'`), "acme-corp", "slug generated from the name");
      const longBiz = newBusiness(ALICE, "An Extremely Long Business Name That Goes On And On");
      assertEqual(psql(`select length(slug) <= 32 and core.business_slug_problem(slug) is null from core.business_settings where business_id = '${longBiz}'`), "t", "a long name gives a valid prefix");
      const reservedBiz = newBusiness(ALICE, "Test");
      assertEqual(psql(`select slug from core.business_settings where business_id = '${reservedBiz}'`), "test-business", "a reserved name gets a suffix");
      assertThrows(() => sr(`update core.business_settings set slug = 'Bad Slug' where business_id = '${acme}'`), "the CHECK refuses an invalid slug even for the service role");

      console.log("Verifying members can't change an address or status directly...");
      assertThrows(() => psqlAs(ALICE, `update core.business_settings set slug = 'alice-takes-this' where business_id = '${acme}'`), "a member can't change the address");
      assertThrows(() => psqlAs(ALICE, `update core.businesses set status = 'suspended' where id = '${acme}'`), "a member can't change the status");
      assertEqual(psqlAs(ALICE, `select core.business_slug_available('acme-corp')`), "f", "a used address isn't available");
      assertEqual(psqlAs(ALICE, `select core.business_slug_available('brand-new-co')`), "t", "a free valid address is available");
      assertEqual(psqlAs(ALICE, `select core.business_slug_available('admin')`), "f", "a reserved address isn't available");

      console.log("Verifying host resolution...");
      assertEqual(psql(`set local role service_role; select name || '|' || status from core.resolve_business_host('acme-corp')`), "Acme Corp|active", "an address resolves (server-side, before sign-in)");
      assertThrows(() => psqlAs(ALICE, `select * from core.resolve_business_host('bob-co')`), "clients can't enumerate addresses directly");
      assertEqual(psql(`set local role service_role; select count(*) from core.resolve_business_host('nobody-here')`), "0", "an unknown address resolves to nothing");
      assertEqual(psql(`set local role service_role; select name from core.resolve_business_host('ACME-CORP')`), "Acme Corp", "the label is case-insensitive");

      console.log("Verifying environments are vendor-only...");
      assertThrows(() => psqlAs(ALICE, `select platform.create_business_environment('${ALICE}', '${acme}', 'test')`), "an owner can't call the vendor function");
      assertThrows(() => psqlAs(ALICE, `select * from platform.business_environments`), "the environments table has no client access");

      console.log("Verifying environment creation...");
      psql(`update core.business_settings set plan = 'pro' where business_id = '${acme}'`);
      const acmeTest = sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'test')`);
      assertEqual(
        psql(`select b.name || '|' || s.slug || '|' || s.plan || '|' || (b.account_id = (select account_id from core.businesses where id = '${acme}')) from core.businesses b join core.business_settings s on s.business_id = b.id where b.id = '${acmeTest}'`),
        "Acme Corp (Test)|acme-corp-test|pro|true",
        "named, addressed, same plan, same account",
      );
      assertEqual(psql(`select string_agg(user_id::text || ':' || role || ':' || status, ',') from core.business_members where business_id = '${acmeTest}'`), `${ALICE}:owner:active`, "the organization's owner owns the environment");
      const acmeStaging = sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'staging')`);
      assertEqual(psql(`select slug from core.business_settings where business_id = '${acmeStaging}'`), "acme-corp-staging", "staging address");
      assertThrows(() => sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'test')`), "one environment of each kind");
      assertThrows(() => sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'production')`), "the organization is already production");
      assertThrows(() => sr(`select platform.create_business_environment('${ZOE}', '${acmeTest}', 'staging')`), "no environment of an environment");

      console.log("Verifying suffixes never stack and production goes to the bare prefix...");
      const devOrg = newBusiness(BOB, "Planet");
      psql(`insert into core.business_members (business_id, user_id, role, role_id, status) values ('${devOrg}', '${BOB}', 'owner', (select id from core.roles where business_id is null and key = 'owner'), 'active') on conflict do nothing`);
      sr(`select platform.rename_business_slug('${ZOE}', '${devOrg}', 'planet-dev')`);
      sr(`select platform.set_business_environment('${ZOE}', '${devOrg}', 'development')`);
      const planetStaging = sr(`select platform.create_business_environment('${ZOE}', '${devOrg}', 'staging')`);
      assertEqual(psql(`select slug from core.business_settings where business_id = '${planetStaging}'`), "planet-staging", "no planet-dev-staging");
      const planetProd = sr(`select platform.create_business_environment('${ZOE}', '${devOrg}', 'production')`);
      assertEqual(psql(`select slug from core.business_settings where business_id = '${planetProd}'`), "planet", "production at the bare prefix");

      console.log("Verifying the caller sees only their own environments...");
      assertEqual(
        psqlAs(ALICE, `select string_agg(environment, ',' order by environment) from core.my_business_environments() where business_id in ('${acme}', '${acmeTest}', '${acmeStaging}')`),
        "production,staging,test",
        "Alice sees Acme's three environments",
      );
      assertEqual(psqlAs(ALICE, `select count(*) from core.my_business_environments() where business_id in ('${devOrg}', '${planetStaging}', '${planetProd}')`), "0", "Alice sees none of Bob's");
      assertEqual(psqlAs(BOB, `select count(*) from core.my_business_environments() where business_id in ('${acme}', '${acmeTest}')`), "0", "Bob sees none of Alice's");
      assertEqual(psqlAs(ALICE, `select parent_business_id from core.my_business_environments() where business_id = '${acmeTest}'`), acme, "the link to the organization is visible to its member");

      console.log("Verifying removal frees the address and keeps the data...");
      assertThrows(() => sr(`select platform.remove_business_environment('${ZOE}', '${acme}')`), "the organization itself isn't removed as an environment");
      assertEqual(sr(`select platform.remove_business_environment('${ZOE}', '${acmeTest}')`), "acme-corp-test", "returns the freed address");
      assertEqual(
        psql(`select b.status || '|' || (s.slug like 'acme-corp-test-removed-%' or s.slug like 'acme-corp-test%removed%') || '|' || (e.parent_business_id is null) from core.businesses b join core.business_settings s on s.business_id = b.id join platform.business_environments e on e.business_id = b.id where b.id = '${acmeTest}'`),
        "decommissioned|true|true",
        "decommissioned, renamed, unlinked",
      );
      assertEqual(psql(`select count(*) from core.businesses where id = '${acmeTest}'`), "1", "the row (and its data) is kept");
      const acmeTest2 = sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'test')`);
      assertEqual(psql(`select slug from core.business_settings where business_id = '${acmeTest2}'`), "acme-corp-test", "the address and slot are free again");

      console.log("Verifying vendor rename, address change and suspension...");
      sr(`select platform.rename_organization('${ZOE}', '${acme}', 'Acme Global')`);
      assertEqual(psql(`select string_agg(name, ',' order by name) from core.businesses where id in ('${acme}', '${acmeTest2}', '${acmeStaging}')`), "Acme Global,Acme Global (Staging),Acme Global (Test)", "environments follow the rename");
      assertThrows(() => sr(`select platform.rename_organization('${ZOE}', '${acmeTest2}', 'X Co')`), "an environment isn't renamed on its own");
      assertThrows(() => sr(`select platform.rename_business_slug('${ZOE}', '${acme}', 'bob-co')`), "an address in use can't be taken");
      assertEqual(sr(`select platform.rename_business_slug('${ZOE}', '${acme}', 'acme')`), "acme-corp", "the old address is returned");
      assertEqual(psql(`set local role service_role; select count(*) from core.resolve_business_host('acme-corp')`), "0", "the old address stops resolving at once");
      sr(`select platform.set_business_status('${ZOE}', '${acme}', 'suspended', 'Unpaid invoice')`);
      assertEqual(psql(`select status || '|' || (suspended_at is not null) || '|' || suspension_reason from core.businesses where id = '${acme}'`), "suspended|true|Unpaid invoice", "suspended with a reason");
      assertEqual(psql(`set local role service_role; select status from core.resolve_business_host('acme')`), "suspended", "the address reports the suspension");
      assertThrows(() => sr(`select platform.create_business_environment('${ZOE}', '${acme}', 'development')`), "a suspended organization gets no new environment");
      sr(`select platform.set_business_status('${ZOE}', '${acme}', 'active', null)`);
      assertEqual(psql(`select status || '|' || (suspended_at is null) || '|' || coalesce(suspension_reason, '-') from core.businesses where id = '${acme}'`), "active|true|-", "re-activated, fields cleared");

      console.log("Verifying removing the organization removes its environments...");
      assertEqual(sr(`select platform.remove_organization('${ZOE}', '${devOrg}')`), "3", "the organization and its two environments");
      assertEqual(psql(`select string_agg(distinct status, ',') from core.businesses where id in ('${devOrg}', '${planetStaging}', '${planetProd}')`), "decommissioned", "all decommissioned");

      console.log("Verifying every vendor change is audited...");
      assertEqual(
        psql(`set local role service_role; select count(*) >= 12 and bool_and(actor_id = '${ZOE}') and bool_and(severity = 'high') from platform.audit_log where resource_type in ('business_environment', 'organization', 'business_address', 'business_status')`),
        "t",
        "audited, by the acting superadmin, at high severity",
      );

      console.log("\nAll organization address and environment checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
