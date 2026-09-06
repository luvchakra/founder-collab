#!/usr/bin/env node
/**
 * Tenant-isolation test for the discovery schema (CLAUDE.md principle 9: "tenant
 * isolation tests are mandatory for anything touching workspace- or business-scoped
 * data"). Applies every migration to a throwaway database — a local Postgres by
 * default, or whatever PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE point at (CI runs
 * this against a postgres service container) — then proves RLS actually isolates
 * tenants, not just that the schema exists.
 *
 * This is a stand-in for testing against the real target Supabase project
 * (unreachable from environments without network access to it, see
 * docs/PORT-PROVENANCE.md's network note): same Postgres engine, same RLS mechanism,
 * but auth/storage are minimal stubs (supabase/tests/local-stub.sql) rather than a real
 * Supabase project. Re-run the same assertions against the real project once it's
 * reachable.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");
const TEST_DB = `discovery_rls_test_${process.pid}`;

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

function psql(sql) {
  return run("psql", ["-d", TEST_DB, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-q", "-c", sql]).trim();
}

function psqlAsAlice(sql) {
  return psql(`
    set local role authenticated;
    set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
    ${sql}
  `);
}

function psqlAsBob(sql) {
  return psql(`
    set local role authenticated;
    set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
    ${sql}
  `);
}

function assertEqual(actual, expected, label) {
  if (String(actual).trim() !== String(expected)) {
    throw new Error(`FAIL: ${label} — expected "${expected}", got "${actual}"`);
  }
  console.log(`  ok: ${label}`);
}

function assertThrows(fn, label) {
  try {
    fn();
  } catch {
    console.log(`  ok: ${label}`);
    return;
  }
  throw new Error(`FAIL: ${label} — expected an error, none was thrown`);
}

function main() {
  console.log(`Setting up ${TEST_DB}...`);
  try {
    run("dropdb", ["--if-exists", TEST_DB]);
  } catch {
    // fine if it didn't exist
  }
  run("createdb", [TEST_DB]);
  run("psql", ["-d", TEST_DB, "-v", "ON_ERROR_STOP=1", "-f", STUB_FILE]);

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    console.log(`Applying ${file}...`);
    run("psql", ["-d", TEST_DB, "-v", "ON_ERROR_STOP=1", "-f", join(MIGRATIONS_DIR, file)]);
  }

  console.log("Seeding two tenants...");
  psql(`
    insert into auth.users (id, email) values
      ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
      ('22222222-2222-2222-2222-222222222222', 'bob@example.com');
    grant usage on schema discovery to authenticated;
    grant select, insert, update, delete on all tables in schema discovery to authenticated;
    grant usage on schema core to authenticated;
    grant select, insert, update, delete on all tables in schema core to authenticated;
    do $$
    declare
      alice_account uuid; bob_account uuid;
      alice_business uuid; bob_business uuid;
      alice_product uuid; bob_product uuid;
    begin
      select account_id into alice_account from core.account_members where user_id = '11111111-1111-1111-1111-111111111111';
      select account_id into bob_account from core.account_members where user_id = '22222222-2222-2222-2222-222222222222';
      insert into core.businesses (account_id, name) values (alice_account, 'Alice Co') returning id into alice_business;
      insert into core.businesses (account_id, name) values (bob_account, 'Bob Co') returning id into bob_business;
      insert into discovery.products (business_id, name) values (alice_business, 'Alice Product') returning id into alice_product;
      insert into discovery.products (business_id, name) values (bob_business, 'Bob Product') returning id into bob_product;
    end $$;
    insert into discovery.prospects (workspace_id, company_name)
    select w.id, 'Prospect for ' || p.name
    from discovery.workspaces w join discovery.products p on p.id = w.product_id;
  `);

  console.log("Verifying auto-provisioning...");
  assertEqual(psql("select count(*) from core.accounts"), "2", "handle_new_user created one account per signup");
  assertEqual(psql("select count(*) from core.user_profiles"), "2", "handle_new_user created one profile per signup");
  assertEqual(psql("select count(*) from discovery.workspaces"), "2", "create_default_workspace created one workspace per product");

  console.log("Seeding business_members/business_settings/employees (C-2)...");
  psqlAsAlice(`
    insert into core.business_members (business_id, user_id, role)
    select id, '11111111-1111-1111-1111-111111111111', 'owner' from core.businesses where name = 'Alice Co';
    insert into core.business_settings (business_id, gstin)
    select id, 'ALICE_GSTIN' from core.businesses where name = 'Alice Co';
    insert into core.employees (business_id, user_id, job_title)
    select id, '11111111-1111-1111-1111-111111111111', 'Owner' from core.businesses where name = 'Alice Co';
  `);

  console.log("Verifying tenant isolation (read)...");
  assertEqual(psqlAsAlice("select count(*) from discovery.prospects"), "1", "Alice sees only her own prospect");
  assertEqual(psqlAsAlice("select company_name from discovery.prospects"), "Prospect for Alice Product", "Alice's prospect is the right one");
  assertEqual(psqlAsBob("select count(*) from discovery.prospects"), "1", "Bob sees only his own prospect");
  assertEqual(psqlAsAlice("select count(*) from core.accounts"), "1", "Alice sees only her own account");

  console.log("Verifying tenant isolation (write)...");
  const bobWorkspace = psql(`
    select w.id from discovery.workspaces w
    join discovery.products p on p.id = w.product_id
    join core.businesses b on b.id = p.business_id
    where b.name = 'Bob Co'
  `);
  assertThrows(
    () => psqlAsAlice(`insert into discovery.prospects (workspace_id, company_name) values ('${bobWorkspace}', 'Malicious insert')`),
    "Alice cannot insert a prospect into Bob's workspace (RLS with-check)",
  );

  console.log("Verifying tenant isolation on C-2 tables (business_members/business_settings/employees)...");
  assertEqual(psqlAsAlice("select count(*) from core.business_members"), "1", "Alice sees only her own business's membership");
  assertEqual(psqlAsBob("select count(*) from core.business_members"), "0", "Bob sees none of Alice's business membership");
  assertEqual(psqlAsAlice("select gstin from core.business_settings"), "ALICE_GSTIN", "Alice sees her own business settings");
  assertEqual(psqlAsBob("select count(*) from core.business_settings"), "0", "Bob sees none of Alice's business settings");
  assertEqual(psqlAsAlice("select count(*) from core.employees"), "1", "Alice sees her own business's employees");
  assertEqual(psqlAsBob("select count(*) from core.employees"), "0", "Bob sees none of Alice's employees");
  const aliceBusiness = psql(`select id from core.businesses where name = 'Alice Co'`);
  assertThrows(
    () => psqlAsBob(`insert into core.employees (business_id, job_title) values ('${aliceBusiness}', 'Intruder')`),
    "Bob cannot insert an employee into Alice's business (RLS with-check)",
  );

  console.log("Seeding licenses (C-3)...");
  psql(`
    insert into core.licenses (account_id, business_id, module_key, status)
    select account_id, id, 'discovery', 'active' from core.businesses where name = 'Alice Co';
    insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
    select account_id, id, 'inventory', 'grace', now() + interval '10 days' from core.businesses where name = 'Alice Co';
  `);

  console.log("Verifying has_module()/has_module_write() (C-3)...");
  assertEqual(psql(`select core.has_module('${aliceBusiness}', 'discovery')`), "t", "active license grants read access");
  assertEqual(psql(`select core.has_module_write('${aliceBusiness}', 'discovery')`), "t", "active license grants write access");
  assertEqual(psql(`select core.has_module('${aliceBusiness}', 'inventory')`), "t", "grace-period license still grants read access");
  assertEqual(psql(`select core.has_module_write('${aliceBusiness}', 'inventory')`), "f", "grace-period license denies write access");
  assertEqual(psql(`select core.has_module('${aliceBusiness}', 'fsm')`), "f", "no license for a module denies access");

  console.log("Verifying tenant isolation on licenses (C-3)...");
  assertEqual(psqlAsAlice("select count(*) from core.licenses"), "2", "Alice sees only her own business's licenses");
  assertEqual(psqlAsBob("select count(*) from core.licenses"), "0", "Bob sees none of Alice's licenses");
  assertEqual(psql("select count(*) from core.modules"), "5", "the five module rows are seeded");
  assertEqual(psqlAsBob("select count(*) from core.modules"), "5", "the module catalogue is readable by any authenticated user");

  console.log("Verifying anonymous access is denied...");
  assertEqual(
    psql("set local role authenticated; select count(*) from discovery.prospects"),
    "0",
    "a request with no auth.uid() sees zero rows",
  );

  console.log("\nAll discovery RLS checks passed.");
}

try {
  main();
} finally {
  try {
    run("dropdb", ["--if-exists", TEST_DB]);
  } catch {
    // best-effort cleanup
  }
}
