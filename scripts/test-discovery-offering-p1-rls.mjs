#!/usr/bin/env node
/**
 * Tenant-isolation, licence-gating and constraint test for the Discovery offering-centric
 * P1 schema changes (docs/plan/10-DISCOVERY-OFFERING-CENTRIC-BACKLOG.md):
 *
 *   - DISC-OFFER-P1-02.3: `discovery_definitions.play_key` (20260927300000)
 *   - DISC-OFFER-P1-01.3: `watchlist_entries` rewritten to tenant AND licensed, via
 *     `discovery.licensed_workspace_ids()` / `write_licensed_workspace_ids()` (20260927300100)
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

      console.log("DISC-OFFER-P1-01.3: watchlist -- tenant isolation...");
      psqlAsAlice(`insert into discovery.watchlist_entries (workspace_id, prospect_id, watch_reason) values ('${aliceWorkspace}', '${aliceProspect}', 'Budget cycle')`);
      psqlAsAlice(`insert into discovery.watchlist_entries (workspace_id, prospect_id, watch_reason) values ('${aliceWorkspace2}', '${aliceProspect2}', 'Training refresh')`);
      psqlAsBob(`insert into discovery.watchlist_entries (workspace_id, prospect_id, watch_reason) values ('${bobWorkspace}', '${bobProspect}', 'Bob reason')`);
      assertEqual(psqlAsAlice("select count(*) from discovery.watchlist_entries"), "2", "Alice sees only her own two watches");
      assertEqual(
        psqlAsAlice("select string_agg(watch_reason, ',' order by watch_reason) from discovery.watchlist_entries"),
        "Budget cycle,Training refresh",
        "the same account is watched differently under each of Alice's offerings",
      );
      assertEqual(psqlAsBob("select count(*) from discovery.watchlist_entries"), "1", "Bob sees only his own watch");
      assertThrows(
        () => psqlAsBob(`insert into discovery.watchlist_entries (workspace_id, prospect_id, watch_reason) values ('${aliceWorkspace}', '${aliceProspect}', 'Intrusion')`),
        "Bob cannot watch an account in Alice's workspace",
      );
      assertEqual(psqlAsBob(`update discovery.watchlist_entries set watch_reason = 'hijack' where workspace_id = '${aliceWorkspace}' returning id`), "", "Bob cannot edit Alice's watch");
      assertEqual(psqlAsBob(`delete from discovery.watchlist_entries where workspace_id = '${aliceWorkspace}' returning id`), "", "Bob cannot delete Alice's watch");
      assertEqual(psql(`select count(*) from discovery.watchlist_entries where workspace_id = '${aliceWorkspace}'`), "1", "Alice's watch is untouched");

      console.log("DISC-OFFER-P1-01.3: watchlist -- licence gating...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '10 days' where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      assertEqual(psqlAsAlice("select count(*) from discovery.watchlist_entries"), "2", "in grace, Alice can still read her watches");
      assertThrows(
        () => psqlAsAlice(`insert into discovery.watchlist_entries (workspace_id, prospect_id, watch_reason) values ('${aliceWorkspace}', '${aliceProspect}', 'Grace write')`),
        "in grace, Alice cannot add a watch (read-only)",
      );
      assertEqual(psqlAsAlice(`update discovery.watchlist_entries set watch_reason = 'grace edit' returning id`), "", "in grace, Alice cannot edit a watch");
      assertEqual(psqlAsAlice(`delete from discovery.watchlist_entries returning id`), "", "in grace, Alice cannot remove a watch");
      psql(`update core.licenses set status = 'cancelled', grace_ends_at = null where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      assertEqual(psqlAsAlice("select count(*) from discovery.watchlist_entries"), "0", "with the licence cancelled, Alice sees no watches");
      assertEqual(psql(`select count(*) from discovery.watchlist_entries where workspace_id in ('${aliceWorkspace}', '${aliceWorkspace2}')`), "2", "cancelling never deletes the watches (ADR-9)");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'discovery'`);
      assertEqual(psqlAsAlice("select count(*) from discovery.watchlist_entries"), "2", "reactivation restores every watch");

      console.log("\nAll Discovery offering P1 checks passed.");
    },
  });
}

main();
