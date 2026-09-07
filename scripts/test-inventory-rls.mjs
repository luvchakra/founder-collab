#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating test for the `inventory` schema (Epic 4, story
 * SP-3a; CLAUDE.md principle 9: license-gating tests are mandatory for a licensed
 * module's tables), via the shared harness (C-8). This is the first real exercise of
 * the `tenant AND licensed` RLS pattern (ADR-8) C-9 benchmarked and fixed.
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
    dbNamePrefix: "inventory_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two businesses, no inventory license yet...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema inventory to authenticated;
        grant select, insert, update, delete on all tables in schema inventory to authenticated;
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
      const aliceItem = psqlAsAlice(`insert into core.items (business_id, name) values ('${aliceBusiness}', 'Widget') returning id;`);

      console.log("Verifying no license at all denies both read and write...");
      assertEqual(psqlAsAlice(`select count(*) from inventory.warehouses`), "0", "with no license, Alice sees zero warehouses even before any exist (sanity)");
      assertThrows(
        () => psqlAsAlice(`insert into inventory.warehouses (business_id, name, code) values ('${aliceBusiness}', 'Main', 'MAIN')`),
        "with no inventory license at all, Alice cannot create a warehouse",
      );

      console.log("Activating a grace-period license and re-checking...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status, grace_ends_at)
        select account_id, id, 'inventory', 'grace', now() + interval '10 days' from core.businesses where id = '${aliceBusiness}';
      `);
      assertThrows(
        () => psqlAsAlice(`insert into inventory.warehouses (business_id, name, code) values ('${aliceBusiness}', 'Main', 'MAIN')`),
        "a grace-period license still denies writes (has_module_write()-equivalent is false)",
      );

      console.log("Activating the license and creating real inventory data...");
      psql(`update core.licenses set status = 'active' where business_id = '${aliceBusiness}' and module_key = 'inventory';`);
      const aliceWarehouse = psqlAsAlice(`insert into inventory.warehouses (business_id, name, code) values ('${aliceBusiness}', 'Main', 'MAIN') returning id;`);
      assertEqual(psqlAsAlice(`select count(*) from inventory.warehouses`), "1", "an active license allows both read and write");
      psqlAsAlice(`
        insert into inventory.stock_levels (business_id, item_id, warehouse_id, quantity)
        values ('${aliceBusiness}', '${aliceItem}', '${aliceWarehouse}', 100);
      `);
      psqlAsAlice(`
        insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity)
        values ('${aliceBusiness}', '${aliceItem}', '${aliceWarehouse}', 'inbound', 100);
      `);

      console.log("Verifying tenant isolation between two licensed businesses...");
      psql(`
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'inventory', 'active' from core.businesses where id = '${bobBusiness}';
      `);
      const bobItem = psqlAsBob(`insert into core.items (business_id, name) values ('${bobBusiness}', 'Gadget') returning id;`);
      const bobWarehouse = psqlAsBob(`insert into inventory.warehouses (business_id, name, code) values ('${bobBusiness}', 'Bob Main', 'BMAIN') returning id;`);
      assertEqual(psqlAsBob("select count(*) from inventory.warehouses"), "1", "Bob sees only his own warehouse");
      assertEqual(psqlAsAlice("select count(*) from inventory.warehouses"), "1", "Alice still sees only her own warehouse");

      console.log("Verifying the cross-tenant warehouse_id/item_id triggers...");
      assertThrows(
        () => psqlAsBob(`insert into inventory.stock_levels (business_id, item_id, warehouse_id, quantity) values ('${bobBusiness}', '${bobItem}', '${aliceWarehouse}', 1)`),
        "Bob cannot record stock in Alice's warehouse",
      );
      assertThrows(
        () => psqlAsBob(`insert into inventory.stock_levels (business_id, item_id, warehouse_id, quantity) values ('${bobBusiness}', '${aliceItem}', '${bobWarehouse}', 1)`),
        "Bob cannot record stock for Alice's item",
      );

      console.log("Verifying stock_transfers: self-transfer check + cross-tenant warehouse trigger...");
      const aliceWarehouse2 = psqlAsAlice(`insert into inventory.warehouses (business_id, name, code) values ('${aliceBusiness}', 'Backup', 'BACKUP') returning id;`);
      assertThrows(
        () => psqlAsAlice(`insert into inventory.stock_transfers (business_id, transfer_number, source_warehouse_id, destination_warehouse_id) values ('${aliceBusiness}', 'ST-1', '${aliceWarehouse}', '${aliceWarehouse}')`),
        "a transfer cannot have the same source and destination warehouse",
      );
      const aliceTransfer = psqlAsAlice(`
        insert into inventory.stock_transfers (business_id, transfer_number, source_warehouse_id, destination_warehouse_id)
        values ('${aliceBusiness}', 'ST-1', '${aliceWarehouse}', '${aliceWarehouse2}') returning id;
      `);
      assertThrows(
        () => psqlAsBob(`insert into inventory.stock_transfers (business_id, transfer_number, source_warehouse_id, destination_warehouse_id) values ('${bobBusiness}', 'ST-BOB', '${aliceWarehouse}', '${bobWarehouse}')`),
        "Bob cannot create a transfer sourced from Alice's warehouse",
      );
      psqlAsAlice(`
        insert into inventory.stock_transfer_items (business_id, stock_transfer_id, item_id, quantity)
        values ('${aliceBusiness}', '${aliceTransfer}', '${aliceItem}', 10);
      `);
      assertThrows(
        () => psqlAsBob(`insert into inventory.stock_transfer_items (business_id, stock_transfer_id, item_id, quantity) values ('${bobBusiness}', '${aliceTransfer}', '${bobItem}', 1)`),
        "Bob cannot attach a transfer line to Alice's transfer",
      );

      console.log("Verifying inventory.sales_return_lines_stock + its cross-tenant trigger...");
      const aliceParty = psqlAsAlice(`insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Alice Customer') returning id;`);
      const aliceReturnDoc = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, party_id) values ('${aliceBusiness}', 'sales_return', 'inventory', '${aliceParty}') returning id;
      `);
      const aliceReturnLine = psqlAsAlice(`
        insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${aliceBusiness}', '${aliceReturnDoc}', '${aliceItem}', 1) returning id;
      `);
      psqlAsAlice(`
        insert into inventory.sales_return_lines_stock (business_id, document_line_id, restock, is_damaged)
        values ('${aliceBusiness}', '${aliceReturnLine}', true, false);
      `);
      assertEqual(psqlAsAlice(`select restock from inventory.sales_return_lines_stock where document_line_id = '${aliceReturnLine}'`), "t", "the stock-effect row round-trips");
      assertThrows(
        () => psqlAsBob(`insert into inventory.sales_return_lines_stock (business_id, document_line_id) values ('${bobBusiness}', '${aliceReturnLine}')`),
        "Bob cannot attach stock-effect fields to Alice's document line",
      );

      console.log("Verifying demo_seed tables have no client access at all...");
      assertEqual(psqlAsAlice("select count(*) from inventory.demo_seed_batches"), "0", "a member sees zero rows regardless of RLS state -- no select policy exists");
      assertThrows(
        () => psqlAsAlice(`insert into inventory.demo_seed_batches (business_id, target_user_id, requested_by) values ('${aliceBusiness}', '${ALICE}', '${ALICE}')`),
        "a member cannot insert a demo_seed_batches row -- service-role only",
      );

      console.log("\nAll inventory schema RLS checks passed.");
    },
  });
}

main();
