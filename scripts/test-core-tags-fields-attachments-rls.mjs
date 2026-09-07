#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.tags/taggings, core.custom_field_defs/
 * values, and core.attachments (Epic 3, story D-8; CLAUDE.md principle 9), via the
 * shared harness (C-8).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "core_tags_fields_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants with a party each...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);
      const aliceParty = psqlAsAlice(`
        insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Acme Inc') returning id;
      `);

      console.log("Verifying tags + polymorphic taggings...");
      const vipTag = psqlAsAlice(`insert into core.tags (business_id, scope, name, color) values ('${aliceBusiness}', 'contact', 'VIP', '#ff0000') returning id;`);
      psqlAsAlice(`insert into core.taggings (business_id, tag_id, taggable_type, taggable_id) values ('${aliceBusiness}', '${vipTag}', 'party', '${aliceParty}');`);
      assertEqual(psqlAsAlice(`select count(*) from core.taggings where taggable_id = '${aliceParty}'`), "1", "the party has one tagging");
      assertThrows(
        () => psqlAsAlice(`insert into core.tags (business_id, scope, name) values ('${aliceBusiness}', 'contact', 'VIP')`),
        "a duplicate tag name in the same scope for the same business is rejected",
      );

      console.log("Verifying tenant isolation on tags/taggings...");
      assertEqual(psqlAsBob("select count(*) from core.tags"), "0", "Bob sees none of Alice's tags");
      assertEqual(psqlAsBob("select count(*) from core.taggings"), "0", "Bob sees none of Alice's taggings");
      assertThrows(
        () => psqlAsBob(`insert into core.taggings (business_id, tag_id, taggable_type, taggable_id) values ('${bobBusiness}', '${vipTag}', 'party', '${aliceParty}')`),
        "Bob cannot tag anything with Alice's tag",
      );

      console.log("Verifying custom field defs (global vs service-type-scoped uniqueness)...");
      psqlAsAlice(`insert into core.custom_field_defs (business_id, entity_type, key, label, field_type) values ('${aliceBusiness}', 'party', 'industry', 'Industry', 'text');`);
      assertThrows(
        () => psqlAsAlice(`insert into core.custom_field_defs (business_id, entity_type, key, label, field_type) values ('${aliceBusiness}', 'party', 'industry', 'Industry Again', 'text')`),
        "a second global def with the same (business, entity_type, key) is rejected",
      );
      const serviceTypeA = "33333333-3333-3333-3333-333333333333";
      const serviceTypeB = "44444444-4444-4444-4444-444444444444";
      psqlAsAlice(`insert into core.custom_field_defs (business_id, entity_type, service_type_id, key, label, field_type) values ('${aliceBusiness}', 'job', '${serviceTypeA}', 'warranty_months', 'Warranty (months)', 'number');`);
      psqlAsAlice(`insert into core.custom_field_defs (business_id, entity_type, service_type_id, key, label, field_type) values ('${aliceBusiness}', 'job', '${serviceTypeB}', 'warranty_months', 'Warranty (months)', 'number');`);
      assertEqual(psqlAsAlice(`select count(*) from core.custom_field_defs where key = 'warranty_months'`), "2", "the same key can be reused across two different service types");
      assertThrows(
        () => psqlAsAlice(`insert into core.custom_field_defs (business_id, entity_type, service_type_id, key, label, field_type) values ('${aliceBusiness}', 'job', '${serviceTypeA}', 'warranty_months', 'Dup', 'number')`),
        "a duplicate key within the same service type is rejected",
      );

      console.log("Verifying custom field values + the cross-tenant trigger...");
      const industryDef = psqlAsAlice(`select id from core.custom_field_defs where key = 'industry'`);
      psqlAsAlice(`insert into core.custom_field_values (business_id, field_def_id, entity_id, value) values ('${aliceBusiness}', '${industryDef}', '${aliceParty}', '"Manufacturing"');`);
      assertEqual(psqlAsAlice(`select value from core.custom_field_values where entity_id = '${aliceParty}'`), '"Manufacturing"', "the value round-trips as jsonb");
      assertEqual(psqlAsBob("select count(*) from core.custom_field_values"), "0", "Bob sees none of Alice's custom field values");
      const bobParty = psqlAsBob(`insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bolt Supply') returning id;`);
      assertThrows(
        () => psqlAsBob(`insert into core.custom_field_values (business_id, field_def_id, entity_id, value) values ('${bobBusiness}', '${industryDef}', '${bobParty}', '"Nope"')`),
        "Bob cannot set a value against Alice's field def",
      );

      console.log("Verifying attachment metadata + tenant isolation...");
      psqlAsAlice(`
        insert into core.attachments (business_id, entity_type, entity_id, storage_path, file_name, content_type, size_bytes)
        values ('${aliceBusiness}', 'party', '${aliceParty}', '${aliceBusiness}/some-id/logo.png', 'logo.png', 'image/png', 1024);
      `);
      assertEqual(psqlAsAlice("select count(*) from core.attachments"), "1", "Alice sees her own attachment metadata");
      assertEqual(psqlAsBob("select count(*) from core.attachments"), "0", "Bob sees none of Alice's attachment metadata");

      console.log("Verifying the attachments storage bucket exists with private visibility...");
      assertEqual(psql("select public::text from storage.buckets where id = 'attachments'"), "false", "the attachments bucket is private, not public");

      console.log("\nAll core.tags/custom_fields/attachments RLS checks passed.");
    },
  });
}

main();
