#!/usr/bin/env node
/**
 * License-gating test for `gst.tax_rules` (COMPLY-P0-02.3). Unlike every other
 * `gst`-schema table so far, this one has no `business_id` at all (a tax rule is a fact
 * about a country/regime's law, not something a business owns -- see the migration's own
 * comment) -- so there is no tenant-isolation angle to test, only: (1) SELECT is gated on
 * the calling user having ANY `gst`-licensed business, not a specific row match, and (2)
 * no `authenticated` role can write to this table at all, only `service_role` (this
 * module's own admin client) -- plus the schema's own versioning invariants (effective
 * date ordering, one row per lineage/version).
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // belongs to a gst-licensed business
const BOB = "22222222-2222-2222-2222-222222222222"; // belongs to NO business at all

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_tax_rules_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select on gst.tax_rules to authenticated;
      `);
      const aliceBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role) values ('${aliceBusiness}', '${ALICE}', 'owner');
      `);

      console.log("With no gst license anywhere, Alice cannot see tax rules yet...");
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.tax_rules`),
        "0",
        "unlicensed read returns nothing (RLS, not an error -- same shape as every other licensed-table SELECT policy)",
      );

      console.log("Publishing v1 of a rule lineage (via the harness's own superuser connection -- the same path the admin client uses in production, since RLS grants authenticated no write access at all)...");
      const ruleV1 = psql(`
        insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, source)
        values ('IN', null, 'GST', 'GST_STANDARD_RATE', '{"ratePercent": 18}'::jsonb, 1, '2017-07-01', 'CBIC Notification 1/2017-CT (Rate)')
        returning id;
      `);

      console.log("Licensing Alice's business for gst unlocks reading tax rules -- ANY licensed business, not a per-row match...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id = '${aliceBusiness}';
      `);
      assertEqual(
        psqlAsAlice(`select value ->> 'ratePercent' from gst.tax_rules where id = '${ruleV1}'`),
        "18",
        "Alice can now read the published rule",
      );

      console.log("Bob (no business at all, so no license) still cannot see it...");
      assertEqual(psqlAsBob(`select count(*)::int from gst.tax_rules`), "0", "Bob has no gst-licensed business anywhere");

      console.log("Nobody, not even licensed Alice, can insert/update/delete a tax rule directly (no grant to authenticated at all -- writes are service_role/admin-client only)...");
      assertThrows(
        () =>
          psqlAsAlice(`
            insert into gst.tax_rules (country, regime, rule_key, value, version, effective_from, source)
            values ('IN', 'GST', 'HACKED_RULE', '{}'::jsonb, 1, '2026-01-01', 'nobody')
          `),
        "authenticated has no INSERT grant on gst.tax_rules",
      );
      assertThrows(
        () => psqlAsAlice(`update gst.tax_rules set value = '{"ratePercent": 0}'::jsonb where id = '${ruleV1}'`),
        "authenticated has no UPDATE grant on gst.tax_rules",
      );
      assertThrows(
        () => psqlAsAlice(`delete from gst.tax_rules where id = '${ruleV1}'`),
        "authenticated has no DELETE grant on gst.tax_rules",
      );

      console.log("A rule with a blank rule_key or source is rejected (check constraints)...");
      assertThrows(
        () =>
          psql(`
            insert into gst.tax_rules (country, regime, rule_key, value, version, effective_from, source)
            values ('IN', 'GST', '   ', '{}'::jsonb, 1, '2026-01-01', 'some source')
          `),
        "blank rule_key fails the length(trim(rule_key)) > 0 check",
      );
      assertThrows(
        () =>
          psql(`
            insert into gst.tax_rules (country, regime, rule_key, value, version, effective_from, source)
            values ('IN', 'GST', 'SOME_RULE', '{}'::jsonb, 1, '2026-01-01', '')
          `),
        "blank source fails the length(trim(source)) > 0 check",
      );

      console.log("effective_to must come strictly after effective_from...");
      assertThrows(
        () =>
          psql(`
            insert into gst.tax_rules (country, regime, rule_key, value, version, effective_from, effective_to, source)
            values ('IN', 'GST', 'BACKWARDS_RULE', '{}'::jsonb, 1, '2026-01-01', '2025-01-01', 'some source')
          `),
        "effective_to before effective_from violates the check constraint",
      );

      console.log("Superseding: closing v1's effective_to and publishing v2 (the shape supersedeTaxRule performs as two admin-client statements)...");
      psql(`update gst.tax_rules set effective_to = '2027-01-01' where id = '${ruleV1}'`);
      const ruleV2 = psql(`
        insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, source)
        values ('IN', null, 'GST', 'GST_STANDARD_RATE', '{"ratePercent": 20}'::jsonb, 2, '2027-01-01', 'CBIC Notification 9/2026-CT (Rate)')
        returning id;
      `);
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.tax_rules where rule_key = 'GST_STANDARD_RATE'`),
        "2",
        "both versions of the lineage still exist -- superseding never deletes the prior row",
      );
      assertEqual(psqlAsAlice(`select effective_to from gst.tax_rules where id = '${ruleV1}'`), "2027-01-01", "v1 is now closed");
      assertEqual(psqlAsAlice(`select effective_to is null from gst.tax_rules where id = '${ruleV2}'`), "t", "v2 is the open, current version");

      console.log("The lookup-as-of-a-date query picks the right version on either side of the supersede date...");
      assertEqual(
        psqlAsAlice(`
          select value ->> 'ratePercent' from gst.tax_rules
          where country = 'IN' and regime = 'GST' and jurisdiction is null and rule_key = 'GST_STANDARD_RATE'
            and effective_from <= '2020-01-01' and (effective_to is null or effective_to > '2020-01-01')
          order by version desc limit 1
        `),
        "18",
        "as of 2020, the original 18% rate is in effect",
      );
      assertEqual(
        psqlAsAlice(`
          select value ->> 'ratePercent' from gst.tax_rules
          where country = 'IN' and regime = 'GST' and jurisdiction is null and rule_key = 'GST_STANDARD_RATE'
            and effective_from <= '2027-06-01' and (effective_to is null or effective_to > '2027-06-01')
          order by version desc limit 1
        `),
        "20",
        "as of mid-2027, the superseding 20% rate is in effect",
      );

      console.log("Re-inserting the same lineage/version is rejected by the unique constraint...");
      assertThrows(
        () =>
          psql(`
            insert into gst.tax_rules (country, jurisdiction, regime, rule_key, value, version, effective_from, source)
            values ('IN', null, 'GST', 'GST_STANDARD_RATE', '{"ratePercent": 99}'::jsonb, 2, '2028-01-01', 'duplicate version')
          `),
        "unique (country, regime, jurisdiction, rule_key, version) rejects a second version-2 row",
      );

      console.log("All gst.tax_rules RLS/versioning assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
