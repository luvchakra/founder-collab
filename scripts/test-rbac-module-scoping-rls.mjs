#!/usr/bin/env node
/**
 * RBAC-39 -- module data is scoped to each module's own permissions for every role, in
 * the database, and the only cross-module writes are the declared hand-offs
 * (supabase/migrations/20260927050000..050400, docs/design/rbac.md).
 *
 * One fully licensed business and these people, each on a system role unless noted:
 *   SALLY   sales_manager     -- CRM + Inventory sales + Discovery (view/manage); no Service, no Finance
 *   IAN     inventory_manager -- Inventory only
 *   ANNA    accountant        -- Finance (now able to post) + invoices; no CRM, no Service
 *   VERA    viewer            -- sees every module, changes nothing
 *   TOM     custom "Technician" role -- service.view + jobs.edit only
 *   DORA    custom "Discovery analyst" role -- discovery.view + discovery.manage only
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const OWEN = "88888888-8888-8888-8888-8888888888a1";
const SALLY = "88888888-8888-8888-8888-8888888888a2";
const IAN = "88888888-8888-8888-8888-8888888888a3";
const ANNA = "88888888-8888-8888-8888-8888888888a4";
const VERA = "88888888-8888-8888-8888-8888888888a5";
const TOM = "88888888-8888-8888-8888-8888888888a6";
const DORA = "88888888-8888-8888-8888-8888888888a7";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "rbac_module_scoping_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      console.log("Seeding a fully licensed business...");
      psql(`
        insert into auth.users (id, email) values
          ('${OWEN}', 'owen@example.com'), ('${SALLY}', 'sally@example.com'), ('${IAN}', 'ian@example.com'),
          ('${ANNA}', 'anna@example.com'), ('${VERA}', 'vera@example.com'), ('${TOM}', 'tom@example.com'),
          ('${DORA}', 'dora@example.com');
      `);
      const biz = psql(`insert into core.businesses (account_id, name) select account_id, 'Biz' from core.account_members where user_id = '${OWEN}' returning id`);
      psqlAs(OWEN, `insert into core.business_members (business_id, user_id, role) values ('${biz}', '${OWEN}', 'owner')`);
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select b.account_id, b.id, m, 'active' from core.businesses b,
          unnest(array['discovery','inventory','fsm','crm','gst']) m where b.id = '${biz}';
        insert into core.business_members (business_id, user_id, role) values
          ('${biz}', '${SALLY}', 'sales_manager'), ('${biz}', '${IAN}', 'inventory_manager'),
          ('${biz}', '${ANNA}', 'accountant'), ('${biz}', '${VERA}', 'viewer');
      `);
      const customRole = (name, keys) =>
        psql(`
          with r as (insert into core.roles (business_id, key, name, role_type) values ('${biz}', '${name.toLowerCase()}', '${name}', 'custom') returning id)
          insert into core.role_permission_grants (role_id, permission_key) select r.id, k from r, unnest(array[${keys.map((k) => `'${k}'`).join(",")}]) k
          returning role_id
        `).split("\n")[0];
      const techRole = customRole("Technician", ["service.view", "jobs.edit"]);
      const analystRole = customRole("Analyst", ["discovery.view", "discovery.manage"]);
      psql(`
        insert into core.business_members (business_id, user_id, role_id) values
          ('${biz}', '${TOM}', '${techRole}'), ('${biz}', '${DORA}', '${analystRole}');
      `);
      const party = psql(`insert into core.parties (business_id, name) values ('${biz}', 'Acme Ltd') returning id`);
      const product = psql(`insert into discovery.products (business_id, name) values ('${biz}', 'Offer') returning id`);

      const reads = (who, mod) => psqlAs(who, `select count(*) from core.licensed_business_ids('${mod}')`);
      const writes = (who, mod) => psqlAs(who, `select count(*) from core.write_licensed_business_ids('${mod}')`);

      console.log("Per-module read and write, by role...");
      for (const [who, name, expectRead, expectWrite] of [
        [SALLY, "sales_manager", { crm: 1, inventory: 1, discovery: 1, fsm: 0, gst: 0 }, { crm: 1, inventory: 1, discovery: 1, fsm: 0, gst: 0 }],
        [IAN, "inventory_manager", { crm: 0, inventory: 1, discovery: 0, fsm: 0, gst: 0 }, { crm: 0, inventory: 1, discovery: 0, fsm: 0, gst: 0 }],
        [ANNA, "accountant", { crm: 0, inventory: 1, discovery: 1, fsm: 0, gst: 1 }, { crm: 0, inventory: 1, discovery: 1, fsm: 0, gst: 1 }],
        [VERA, "viewer", { crm: 1, inventory: 1, discovery: 1, fsm: 1, gst: 1 }, { crm: 0, inventory: 0, discovery: 0, fsm: 0, gst: 0 }],
        [TOM, "technician", { crm: 0, inventory: 0, discovery: 0, fsm: 1, gst: 0 }, { crm: 0, inventory: 0, discovery: 0, fsm: 1, gst: 0 }],
        [OWEN, "owner", { crm: 1, inventory: 1, discovery: 1, fsm: 1, gst: 1 }, { crm: 1, inventory: 1, discovery: 1, fsm: 1, gst: 1 }],
      ]) {
        for (const mod of ["crm", "inventory", "discovery", "fsm", "gst"]) {
          assertEqual(reads(who, mod), String(expectRead[mod]), `${name} ${expectRead[mod] ? "reads" : "can't read"} ${mod}`);
          assertEqual(writes(who, mod), String(expectWrite[mod]), `${name} ${expectWrite[mod] ? "writes" : "can't write"} ${mod}`);
        }
      }

      console.log("Discovery is licensed and permitted now, not tenant-only...");
      assertEqual(psqlAs(TOM, `select count(*) from discovery.products`), "0", "a technician can't read offerings");
      assertEqual(psqlAs(TOM, `select count(*) from discovery.workspaces`), "0", "or their workspaces");
      assertEqual(psqlAs(VERA, `select count(*) from discovery.products`), "1", "a viewer reads offerings");
      assertThrows(
        () => psqlAs(VERA, `insert into discovery.products (business_id, name) values ('${biz}', 'Nope')`),
        "a viewer can't create an offering",
      );
      assertEqual(
        psqlAs(DORA, `insert into discovery.products (business_id, name) values ('${biz}', 'Analyst offer') returning 1`),
        "1",
        "discovery.manage creates an offering",
      );
      const workspace = psql(`select id from discovery.workspaces where product_id = '${product}'`);
      assertThrows(
        () => psqlAs(VERA, `insert into discovery.prospects (workspace_id, company_name) values ('${workspace}', 'X')`),
        "a viewer can't add a prospect",
      );
      assertEqual(
        psqlAs(DORA, `insert into discovery.prospects (workspace_id, company_name) values ('${workspace}', 'X') returning 1`),
        "1",
        "discovery.manage adds the same prospect",
      );

      console.log("Declared hand-offs work for exactly the initiating permission...");
      // CRM -> Service: a sales manager (no Service permissions) creates an FSM quote.
      assertEqual(
        psqlAs(SALLY, `insert into fsm.opportunities (business_id, party_id) values ('${biz}', '${party}') returning 1`),
        "1",
        "sales_manager creates a service opportunity from CRM (crm_opportunities.manage)",
      );
      assertEqual(psqlAs(SALLY, `select count(*) from fsm.opportunities`), "1", "and can follow its status");
      assertEqual(psqlAs(SALLY, `select count(*) from fsm.expenses`), "0", "but sees nothing else in Service");
      assertThrows(
        () => psqlAs(IAN, `insert into fsm.opportunities (business_id, party_id) values ('${biz}', '${party}')`),
        "inventory_manager has no such hand-off",
      );
      // Discovery -> CRM: promote a prospect to a lead.
      assertEqual(
        psqlAs(DORA, `insert into crm.lead (business_id, party_id) values ('${biz}', '${party}') returning 1`),
        "1",
        "discovery.manage promotes a prospect to a CRM lead",
      );
      assertEqual(psqlAs(DORA, `select count(*) from crm.channel_connection`), "0", "but sees no other CRM data");
      assertThrows(
        () => psqlAs(TOM, `insert into crm.lead (business_id, party_id) values ('${biz}', '${party}')`),
        "a technician can't create CRM leads",
      );
      // Inventory -> Discovery: mirror an item as an offering.
      assertEqual(
        psqlAs(IAN, `insert into discovery.products (business_id, name) values ('${biz}', 'Mirrored item') returning 1`),
        "1",
        "inventory.edit mirrors an item into Discovery",
      );
      // Service -> Inventory: a technician's job reads availability.
      assertEqual(reads(TOM, "inventory"), "0", "a technician can't read Inventory in general");
      assertEqual(psqlAs(TOM, `select count(*) from inventory.stock_levels`), "0", "but may read stock levels (none yet)");
      psql(`insert into inventory.warehouses (business_id, name, code) values ('${biz}', 'Main', 'MAIN')`);
      assertEqual(psqlAs(TOM, `select count(*) from inventory.warehouses`), "0", "and nothing else in Inventory");
      assertEqual(psqlAs(IAN, `select count(*) from inventory.warehouses`), "1", "(which Inventory's own roles do see)");

      console.log("Grace: hand-offs become read-only with the licence (ADR-9)...");
      psql(`update core.licenses set status = 'grace', grace_ends_at = now() + interval '10 days' where business_id = '${biz}' and module_key = 'fsm'`);
      assertThrows(
        () => psqlAs(SALLY, `insert into fsm.opportunities (business_id, party_id) values ('${biz}', '${party}')`),
        "no hand-off writes into a module in grace",
      );
      assertEqual(psqlAs(SALLY, `select count(*) from fsm.opportunities`), "1", "but the hand-off stays readable");
      psql(`update core.licenses set status = 'active', grace_ends_at = null where business_id = '${biz}' and module_key = 'fsm'`);

      console.log("Role templates and system roles...");
      assertEqual(psqlAs(ANNA, `select core.has_permission('${biz}', 'gst.journal.create')`), "t", "the accountant can post journals");
      assertEqual(psqlAs(ANNA, `select core.has_permission('${biz}', 'gst.activation.manage')`), "f", "but not activate Finance");
      assertEqual(
        psql(`select 'discovery.manage' = any(permission_keys) from core.role_templates where key = 'sales_manager'`),
        "t",
        "the Sales Manager template can work in Discovery",
      );

      console.log("\nAll module-scoping checks passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
