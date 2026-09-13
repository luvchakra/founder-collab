#!/usr/bin/env node
/**
 * RLS test for `platform.compliance_countries`, `platform.compliance_packs`, and
 * `platform.compliance_pack_features` -- PLATFORM-P0-13.1/13.2/13.4 ("Country / Compliance
 * Pack Administration", docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §17). See the
 * migration's own docstring (`20260912440000_platform_compliance_registry.sql`) for the
 * full entity-ownership analysis, why PLATFORM-P0-13.3 ("Rule Version") is deliberately not
 * built, and why this is a growable, superadmin-managed catalog (mirroring
 * `platform.plans`), not a fixed enum (mirroring `platform.modules`/`platform.integrations`).
 *
 * Same bar every `platform.*` table in this backlog is held to: a role-switched query
 * against a real database, not just a read of the policy SQL.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "99999999-9999-9999-9999-999999999991"; // business admin -- NOT a superadmin
const ZOE = "99999999-9999-9999-9999-999999999992"; // real platform superadmin

async function main() {
  await withTestDatabase({
    dbNamePrefix: "platform_compliance_registry_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsZoe = (sql) => psqlAs(ZOE, sql);

      console.log("Seeding a business admin (Alice) and a platform superadmin (Zoe)...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice-compliance@example.com'),
          ('${ZOE}', 'zoe-compliance@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const aliceBiz = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role)
        values ('${aliceBiz}', '${ALICE}', 'admin');
        set local role service_role;
        insert into platform.admins (user_id) values ('${ZOE}');
      `);

      console.log("13.1 -- the country registry seeds from the live module-gst COUNTRY_CATALOG, no fabricated data...");
      assertEqual(psql(`select count(*) from platform.compliance_countries`), "18", "18 seeded countries");
      assertEqual(
        psql(`select enabled::text from platform.compliance_countries where country_code = 'IN'`),
        "true",
        "India seeds enabled -- a real, working implementation exists",
      );
      assertEqual(
        psql(`select enabled::text from platform.compliance_countries where country_code = 'AU'`),
        "false",
        "Australia seeds disabled -- named in the catalog as 'planned', no working implementation yet",
      );

      console.log("13.2 -- compliance packs seed one row per country+regime, enabled matching the source catalog's status...");
      assertEqual(
        psql(`select count(*) from platform.compliance_packs where country_code = 'US'`),
        "2",
        "the US has two packs -- SALES_TAX and INFORMATION_RETURNS",
      );
      assertEqual(
        psql(`select version from platform.compliance_packs where country_code = 'IN' and regime = 'GST'`),
        "",
        "version is null on every seeded pack -- no fabricated pack-release version",
      );

      console.log("13.4 -- only India's GST pack is seeded with feature flags, exactly the doc's own literal example...");
      assertEqual(
        psqlAsZoe(
          `select array_to_string(array_agg(feature_key order by feature_key), ',') from platform.compliance_pack_features f join platform.compliance_packs p on p.id = f.pack_id where p.country_code = 'IN' and p.regime = 'GST'`,
        ),
        "einvoice,eway_bill,gst,ims",
        "exactly the four features the doc's own India example names",
      );
      assertEqual(
        psql(`select count(*) from platform.compliance_pack_features f join platform.compliance_packs p on p.id = f.pack_id where p.country_code <> 'IN'`),
        "0",
        "no other pack has any seeded feature -- avoiding an invented capability taxonomy for packs the doc names no example for",
      );

      console.log("Open SELECT for ANY authenticated user, not superadmin-only, on all three tables...");
      assertEqual(psqlAsAlice(`select count(*) from platform.compliance_countries`), "18", "Alice can read the country registry");
      assertEqual(psqlAsAlice(`select count(*) from platform.compliance_packs`), "19", "Alice can read the pack registry");
      assertEqual(
        psqlAsAlice(`select count(*) from platform.compliance_pack_features`),
        "4",
        "Alice can read the pack-feature registry",
      );

      console.log("Verifying a business admin (not a superadmin) cannot write to any of the three tables...");
      assertThrows(
        () => psqlAsAlice(`insert into platform.compliance_countries (country_code, name) values ('ZZ', 'Rogue')`),
        "Alice's INSERT into compliance_countries is rejected",
      );
      // An UPDATE whose USING clause hides every row from the caller does not raise a
      // Postgres error -- it silently affects zero rows (only a rejected INSERT's WITH
      // CHECK genuinely throws), the same gotcha PLATFORM-P0-07.1's own RLS script first
      // got wrong and later corrected. Asserted here directly rather than with
      // assertThrows.
      psqlAsAlice(`update platform.compliance_countries set enabled = false where country_code = 'IN'`);
      assertEqual(
        psql(`set local role service_role; select enabled::text from platform.compliance_countries where country_code = 'IN'`),
        "true",
        "India is still enabled -- Alice's UPDATE was silently rejected by RLS with zero residue",
      );
      assertThrows(
        () =>
          psqlAsAlice(
            `insert into platform.compliance_packs (country_code, regime, display_name) values ('IN', 'ROGUE', 'Rogue Pack')`,
          ),
        "Alice's INSERT into compliance_packs is rejected",
      );
      assertThrows(
        () =>
          psqlAsAlice(
            `insert into platform.compliance_pack_features (pack_id, feature_key, display_name) select id, 'rogue', 'Rogue' from platform.compliance_packs where country_code = 'IN' and regime = 'GST'`,
          ),
        "Alice's INSERT into compliance_pack_features is rejected",
      );

      console.log("Verifying a real superadmin (Zoe) CAN manage all three tables...");
      psqlAsZoe(`insert into platform.compliance_countries (country_code, name, enabled) values ('BR', 'Brazil', false)`);
      assertEqual(
        psql(`select count(*) from platform.compliance_countries`),
        "19",
        "Zoe's INSERT succeeded -- the registry is genuinely growable, not a fixed enum",
      );
      psqlAsZoe(`update platform.compliance_countries set enabled = true where country_code = 'BR'`);
      assertEqual(
        psql(`select enabled::text from platform.compliance_countries where country_code = 'BR'`),
        "true",
        "Zoe's UPDATE succeeded",
      );

      const brPack = psqlAsZoe(
        `insert into platform.compliance_packs (country_code, regime, display_name, enabled) values ('BR', 'ICMS', 'ICMS', true) returning id`,
      );
      assertEqual(
        psql(`select count(*) from platform.compliance_packs where country_code = 'BR'`),
        "1",
        "Zoe can add a new pack for a new country",
      );
      const brFeature = psqlAsZoe(
        `insert into platform.compliance_pack_features (pack_id, feature_key, display_name, enabled) values ('${brPack}', 'nfe', 'NF-e', true) returning id`,
      );
      assertEqual(
        psqlAsZoe(`select enabled::text from platform.compliance_pack_features where id = '${brFeature}'`),
        "true",
        "Zoe can add a new feature flag for a new pack",
      );
      psqlAsZoe(`update platform.compliance_pack_features set enabled = false where id = '${brFeature}'`);
      assertEqual(
        psqlAsZoe(`select enabled::text from platform.compliance_pack_features where id = '${brFeature}'`),
        "false",
        "Zoe can toggle a feature flag off",
      );

      console.log("Verifying uniqueness constraints hold...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.compliance_countries (country_code, name) values ('IN', 'Duplicate India')`),
        "a duplicate country_code is rejected",
      );
      assertThrows(
        () => psqlAsZoe(`insert into platform.compliance_packs (country_code, regime, display_name) values ('IN', 'GST', 'Duplicate GST')`),
        "a duplicate (country_code, regime) pack is rejected",
      );
      assertThrows(
        () =>
          psqlAsZoe(
            `insert into platform.compliance_pack_features (pack_id, feature_key, display_name) values ('${brPack}', 'nfe', 'Duplicate NF-e')`,
          ),
        "a duplicate (pack_id, feature_key) is rejected",
      );

      console.log("Verifying a compliance_packs.country_code FK is enforced against compliance_countries...");
      assertThrows(
        () => psqlAsZoe(`insert into platform.compliance_packs (country_code, regime, display_name) values ('ZZ', 'FAKE', 'Fake Pack')`),
        "an unknown country_code is rejected by the foreign key",
      );

      console.log("Verifying no DELETE grant exists to authenticated on any of the three tables, even for Zoe...");
      assertThrows(
        () => psqlAsZoe(`delete from platform.compliance_countries where country_code = 'BR'`),
        "even a superadmin cannot DELETE a country -- no such grant exists to authenticated (mirrors platform.plans' own 'disable, never remove' stance)",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.compliance_packs where id = '${brPack}'`),
        "even a superadmin cannot DELETE a pack directly",
      );
      assertThrows(
        () => psqlAsZoe(`delete from platform.compliance_pack_features where id = '${brFeature}'`),
        "even a superadmin cannot DELETE a pack feature directly",
      );

      console.log("\nAll platform.compliance_countries / compliance_packs / compliance_pack_features checks passed.");
    },
  });
}

main();
