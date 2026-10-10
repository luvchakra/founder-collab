#!/usr/bin/env node
/**
 * Tenant-isolation and licence-gating test for the offering-grain Discovery tables the
 * account-watch and grouped-alert stories read: discovery.watchlist_entries
 * (DISC-OFFER-P1-01.3), discovery.signals and discovery.signal_correlations
 * (DISC-OFFER-P1-01.4's grouped alerts), and discovery.opportunities (DISC-OFFER-P1-02.3's
 * plays breakdown). CLAUDE.md principle 9: none of these had an RLS test.
 *
 * Proves: each tenant reads only its own rows in every table; a tenant can't write into
 * another's workspace; and an expired Discovery licence hides the rows (kept, not deleted)
 * until it is reactivated -- `tenant AND licensed`, ADR-9.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "31111111-1111-1111-1111-111111111111";
const BOB = "32222222-2222-2222-2222-222222222222";
const TABLES = ["watchlist_entries", "signals", "signal_correlations", "opportunities"];

async function main() {
  await withTestDatabase({
    dbNamePrefix: "discovery_offering_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding two tenants, each with one prospect and one row in every table...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice-offering@example.com'), ('${BOB}', 'bob-offering@example.com');
        grant usage on schema discovery to authenticated;
        grant select, insert, update, delete on all tables in schema discovery to authenticated;
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        do $$
        declare
          v_user uuid; v_account uuid; v_business uuid; v_product uuid; v_workspace uuid; v_prospect uuid; v_signal1 uuid; v_signal2 uuid;
        begin
          foreach v_user in array array['${ALICE}'::uuid, '${BOB}'::uuid] loop
            select account_id into v_account from core.account_members where user_id = v_user;
            insert into core.businesses (account_id, name) values (v_account, case when v_user = '${ALICE}' then 'Alice Co' else 'Bob Co' end) returning id into v_business;
            insert into core.licenses (account_id, business_id, module_key, status) values (v_account, v_business, 'discovery', 'active');
            insert into discovery.products (business_id, name) values (v_business, 'Product of ' || v_user) returning id into v_product;
            select id into v_workspace from discovery.workspaces where product_id = v_product;
            insert into discovery.prospects (workspace_id, company_name) values (v_workspace, 'Prospect of ' || v_user) returning id into v_prospect;
            insert into discovery.watchlist_entries (workspace_id, prospect_id, watch_reason) values (v_workspace, v_prospect, 'Funding round coming');
            insert into discovery.signals (workspace_id, prospect_id, signal_type, description) values (v_workspace, v_prospect, 'recent_event', 'New CTO') returning id into v_signal1;
            insert into discovery.signals (workspace_id, prospect_id, signal_type, description) values (v_workspace, v_prospect, 'buying_signal', 'Hiring IAM engineers') returning id into v_signal2;
            insert into discovery.signal_correlations (workspace_id, prospect_id, signal_ids, rationale, confidence, earliest_signal_at, latest_signal_at)
              values (v_workspace, v_prospect, array[v_signal1, v_signal2], 'New CTO + Hiring IAM engineers', 'medium', now(), now());
            insert into discovery.opportunities (workspace_id, prospect_id) values (v_workspace, v_prospect);
          end loop;
        end $$;
      `);

      console.log("Verifying each tenant reads only its own rows...");
      for (const table of TABLES) {
        assertEqual(psqlAs(ALICE, `select count(*) from discovery.${table}`), table === "signals" ? "2" : "1", `Alice reads only her own ${table}`);
        assertEqual(psqlAs(BOB, `select count(*) from discovery.${table}`), table === "signals" ? "2" : "1", `Bob reads only his own ${table}`);
      }
      assertEqual(
        psqlAs(ALICE, `select count(*) from discovery.watchlist_entries w join discovery.prospects p on p.id = w.prospect_id where p.company_name like 'Prospect of ${BOB}%'`),
        "0",
        "none of Alice's visible watchlist rows are Bob's",
      );

      console.log("Verifying a tenant can't write into another's workspace...");
      const bobWorkspace = psql(`select w.id from discovery.workspaces w join discovery.products p on p.id = w.product_id join core.businesses b on b.id = p.business_id where b.name = 'Bob Co'`);
      const bobProspect = psql(`select id from discovery.prospects where workspace_id = '${bobWorkspace}'`);
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.watchlist_entries (workspace_id, prospect_id, watch_reason) values ('${bobWorkspace}', '${bobProspect}', 'spying')`),
        "Alice can't add Bob's account to a watchlist",
      );
      assertThrows(
        () => psqlAs(ALICE, `insert into discovery.signal_correlations (workspace_id, prospect_id, signal_ids, rationale, confidence, earliest_signal_at, latest_signal_at) values ('${bobWorkspace}', '${bobProspect}', array[gen_random_uuid()], 'x', 'low', now(), now())`),
        "Alice can't plant a signal group in Bob's workspace",
      );
      psqlAs(ALICE, `update discovery.watchlist_entries set watch_reason = 'hijacked' where workspace_id = '${bobWorkspace}'`);
      assertEqual(psql(`select watch_reason from discovery.watchlist_entries where workspace_id = '${bobWorkspace}'`), "Funding round coming", "Alice's update to Bob's watchlist changes nothing");

      console.log("Verifying an expired Discovery licence hides the rows without deleting them...");
      psql(`update core.licenses set status = 'expired' from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      for (const table of TABLES) {
        assertEqual(psqlAs(ALICE, `select count(*) from discovery.${table}`), "0", `expired licence: Alice reads no ${table}`);
      }
      assertEqual(psql(`select count(*) from discovery.watchlist_entries`), "2", "the rows are still there (never deleted)");
      psql(`update core.licenses set status = 'active' from core.businesses b where b.id = core.licenses.business_id and b.name = 'Alice Co' and module_key = 'discovery'`);
      assertEqual(psqlAs(ALICE, `select count(*) from discovery.watchlist_entries`), "1", "reactivated: Alice's watchlist is back");

      console.log("\nAll offering-grain Discovery RLS checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
