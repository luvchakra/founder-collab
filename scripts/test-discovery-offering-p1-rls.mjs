#!/usr/bin/env node
/**
 * Tenant-isolation, licence-gating and constraint test for the Discovery offering-centric
 * P1 schema changes (docs/plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md):
 *
 *   - DISC-OFFER-P1-02.3: `discovery_definitions.play_key` (20260927300000)
 *
 * Same harness and "tenant AND licensed" shape as test-crm-backlog-rls.mjs: two
 * businesses, one per user, each with its own offering (product -> workspace), then every
 * assertion runs as the signed-in user so RLS is what is being tested.
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
    dbNamePrefix: "discovery_offering_p1_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two businesses, each with one offering and one prospect...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema discovery to authenticated;
        grant select, insert, update, delete on all tables in schema discovery to authenticated;
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
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'discovery', 'active' from core.businesses where id in ('${aliceBusiness}', '${bobBusiness}');
      `);
      const aliceProduct = psql(`insert into discovery.products (business_id, name) values ('${aliceBusiness}', 'Managed IAM') returning id;`);
      const aliceProduct2 = psql(`insert into discovery.products (business_id, name) values ('${aliceBusiness}', 'IAM Training') returning id;`);
      const bobProduct = psql(`insert into discovery.products (business_id, name) values ('${bobBusiness}', 'Bob Offering') returning id;`);
      const aliceWorkspace = psql(`select id from discovery.workspaces where product_id = '${aliceProduct}'`);
      const aliceWorkspace2 = psql(`select id from discovery.workspaces where product_id = '${aliceProduct2}'`);
      const bobWorkspace = psql(`select id from discovery.workspaces where product_id = '${bobProduct}'`);
      const aliceProspect = psql(`insert into discovery.prospects (workspace_id, company_name) values ('${aliceWorkspace}', 'Acme') returning id;`);
      const aliceProspect2 = psql(`insert into discovery.prospects (workspace_id, company_name) values ('${aliceWorkspace2}', 'Acme') returning id;`);
      const bobProspect = psql(`insert into discovery.prospects (workspace_id, company_name) values ('${bobWorkspace}', 'Globex') returning id;`);
      void aliceProspect2;
      void bobProspect;

      console.log("DISC-OFFER-P1-02.3: discovery_definitions.play_key...");
      const playDefinition = psqlAsAlice(`
        insert into discovery.discovery_definitions (workspace_id, name, play_key)
        values ('${aliceWorkspace}', 'Recently Funded', 'recently_funded') returning id;
      `);
      assertEqual(psqlAsAlice(`select play_key from discovery.discovery_definitions where id = '${playDefinition}'`), "recently_funded", "a definition records the play it started from");
      assertEqual(
        psqlAsAlice(`insert into discovery.discovery_definitions (workspace_id, name) values ('${aliceWorkspace}', 'Hand-written') returning coalesce(play_key, 'null');`),
        "null",
        "a hand-written definition has no play",
      );
      assertThrows(
        () => psqlAsAlice(`insert into discovery.discovery_definitions (workspace_id, name, play_key) values ('${aliceWorkspace}', 'Bad', 'Not A Key!')`),
        "a malformed play key is rejected",
      );
      assertEqual(psqlAsBob(`select count(*) from discovery.discovery_definitions where play_key is not null`), "0", "Bob cannot see Alice's play-tagged definitions");

      console.log("\nAll Discovery offering P1 checks passed.");
    },
  });
}

main();
