#!/usr/bin/env node
/**
 * Verifies the D-3 backfill (supabase/migrations/20260906102000_discovery_prospects_
 * party_backfill.sql) actually links pre-existing prospects/contacts into core.parties/
 * party_roles/party_contacts, is idempotent (safe to re-run), and picks up an
 * already-'won' outcome as an immediate 'customer' role rather than waiting for a future
 * outcome change. The migration ran once already (empty, no prospects existed yet) when
 * the harness applied every migration in order, so this test seeds a "pre-existing"
 * prospect row directly via SQL (simulating one created before this migration shipped)
 * and re-runs just the backfill's own DO block against it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");
const BACKFILL_FILE = join(MIGRATIONS_DIR, "20260906102000_discovery_prospects_party_backfill.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";

function extractDoBlock(sql) {
  const start = sql.indexOf("do $$");
  if (start === -1) throw new Error("Could not find the backfill's DO block in the migration file.");
  return sql.slice(start);
}

async function main() {
  const backfillDoBlock = extractDoBlock(readFileSync(BACKFILL_FILE, "utf8"));

  await withTestDatabase({
    dbNamePrefix: "discovery_party_backfill_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);

      console.log("Seeding a business with a 'pre-existing' won prospect + contact...");
      psql(`insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com');`);
      psql(`
        grant usage on schema discovery to authenticated;
        grant select, insert, update, delete on all tables in schema discovery to authenticated;
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
      `);
      const business = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      const product = psqlAsAlice(`
        insert into discovery.products (business_id, name) values ('${business}', 'Alice Product') returning id;
      `);
      const workspace = psql(`select id from discovery.workspaces where product_id = '${product}'`);
      const prospect = psqlAsAlice(`
        insert into discovery.prospects (workspace_id, company_name, company_email, outcome)
        values ('${workspace}', 'Legacy Co', 'legacy@example.com', 'won')
        returning id;
      `);
      psqlAsAlice(`
        insert into discovery.contacts (workspace_id, prospect_id, first_name, last_name, email)
        values ('${workspace}', '${prospect}', 'Pat', 'Legacy', 'pat@legacy.example.com');
      `);
      assertEqual(psql(`select party_id from discovery.prospects where id = '${prospect}'`), "", "the pre-existing prospect starts with no party_id");

      console.log("Running the backfill's DO block...");
      psql(backfillDoBlock);

      console.log("Verifying the backfill linked the prospect to a new party...");
      const partyId = psql(`select party_id from discovery.prospects where id = '${prospect}'`);
      if (!partyId) throw new Error("FAIL: backfill did not set party_id");
      console.log(`  ok: prospect linked to party ${partyId}`);
      assertEqual(psql(`select name from core.parties where id = '${partyId}'`), "Legacy Co", "the party's name matches the prospect's company_name");
      assertEqual(psql(`select count(*) from core.party_roles where party_id = '${partyId}' and role = 'prospect'`), "1", "the party got the 'prospect' role");
      assertEqual(psql(`select count(*) from core.party_roles where party_id = '${partyId}' and role = 'customer'`), "1", "an already-won prospect immediately got the 'customer' role too, not just 'prospect'");
      assertEqual(psql(`select first_name || ' ' || last_name from core.party_contacts where party_id = '${partyId}'`), "Pat Legacy", "the contact was backfilled into core.party_contacts");

      console.log("Re-running the backfill's DO block (idempotency check)...");
      psql(backfillDoBlock);
      assertEqual(psql(`select count(*) from core.parties where business_id = '${business}'`), "1", "re-running the backfill did not create a second party");
      assertEqual(psql(`select count(*) from core.party_roles where party_id = '${partyId}'`), "2", "re-running the backfill did not duplicate roles");
      assertEqual(psql(`select count(*) from core.party_contacts where party_id = '${partyId}'`), "1", "re-running the backfill did not duplicate the contact");

      console.log("\nAll discovery party-backfill checks passed.");
    },
  });
}

main();
