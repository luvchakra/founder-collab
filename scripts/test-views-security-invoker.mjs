#!/usr/bin/env node
/**
 * E2E-DEF-002 regression (docs/testing/E2E_DEFECTS.md): a view in a tenant schema must
 * never bypass the RLS of the tables it reads.
 *
 * A Postgres view without `security_invoker = true` runs with its OWNER's privileges --
 * here `postgres`, which RLS does not restrict -- so the `tenant AND licensed` policies
 * (ADR-4, ADR-8) on its base tables silently stop applying. gst.account_balances shipped
 * exactly that way (its comment assumed security invoker was the default) and exposed
 * every business's chart of accounts and balances to any signed-in user.
 *
 * Two checks:
 *   1. Catalogue: every view in core/discovery/inventory/fsm/crm/gst/platform carries
 *      security_invoker=true -- so the next view anyone adds is held to the same rule.
 *   2. Behaviour: Bob (another business) and Carol (no business at all) see none of
 *      Alice's rows in gst.account_balances; Alice sees her own.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // signed up, no business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "views_security_invoker_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual }) => {
      console.log("Every view in a tenant schema is security_invoker...");
      const offenders = psql(`
        select coalesce(string_agg(n.nspname || '.' || c.relname, ', ' order by 1), '')
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'v'
          and n.nspname in ('core', 'discovery', 'inventory', 'fsm', 'crm', 'gst', 'platform')
          and not coalesce(c.reloptions::text, '') ilike '%security_invoker=true%'
      `);
      assertEqual(offenders, "", "views without security_invoker=true");

      console.log("Seeding two businesses with Finance licences and one account each...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'), ('${BOB}', 'bob@example.com'), ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
      `);
      const alice = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}' returning id;`);
      const bob = psql(`insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}' returning id;`);
      psql(`
        insert into core.business_members (business_id, user_id, role) values
          ('${alice}', '${ALICE}', 'owner'), ('${bob}', '${BOB}', 'owner')
        on conflict do nothing;
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${alice}', '${bob}');
        insert into gst.accounts (business_id, account_number, name, type, opening_balance)
        values ('${alice}', '1100', 'Alice Bank', 'asset', 5000), ('${bob}', '1100', 'Bob Bank', 'asset', 7000);
      `);

      console.log("gst.account_balances honours the base tables' tenant RLS...");
      assertEqual(psqlAs(ALICE, `select count(*) from gst.account_balances where business_id = '${alice}'`), "1", "Alice sees her own account");
      assertEqual(psqlAs(ALICE, `select count(*) from gst.account_balances where business_id <> '${alice}'`), "0", "Alice sees no other business's accounts");
      assertEqual(psqlAs(BOB, `select count(*) from gst.account_balances where business_id = '${alice}'`), "0", "Bob cannot read Alice's balances");
      assertEqual(psqlAs(CAROL, `select count(*) from gst.account_balances`), "0", "a user with no business reads nothing");

      console.log("...and its licence gate: Bob's licence lapsing hides his own balances too.");
      psql(`update core.licenses set status = 'expired' where business_id = '${bob}' and module_key = 'gst'`);
      assertEqual(psqlAs(BOB, `select count(*) from gst.account_balances`), "0", "unlicensed business reads nothing");

      console.log("All view security_invoker assertions passed.");
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
