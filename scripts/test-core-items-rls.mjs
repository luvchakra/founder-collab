#!/usr/bin/env node
/**
 * Tenant-isolation + behavior test for core.item_categories/items/item_inventory_attrs/
 * tax_rates (Epic 3, story D-4; CLAUDE.md principle 9), via the shared harness (C-8).
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
    dbNamePrefix: "core_items_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two tenants...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
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
      const aliceSupplier = psqlAsAlice(`
        insert into core.parties (business_id, name) values ('${aliceBusiness}', 'Acme Supplier') returning id;
      `);

      console.log("Seeding categories and items...");
      const aliceCategory = psqlAsAlice(`
        insert into core.item_categories (business_id, name) values ('${aliceBusiness}', 'Widgets') returning id;
      `);
      const aliceItem = psqlAsAlice(`
        insert into core.items (business_id, category_id, supplier_party_id, sku, name)
        values ('${aliceBusiness}', '${aliceCategory}', '${aliceSupplier}', 'SKU-1', 'Widget') returning id;
      `);
      psqlAsBob(`
        insert into core.items (business_id, name, kind) values ('${bobBusiness}', 'Consulting Hour', 'service');
      `);

      console.log("Verifying tenant isolation (read)...");
      assertEqual(psqlAsAlice("select count(*) from core.items"), "1", "Alice sees only her own item");
      assertEqual(psqlAsBob("select count(*) from core.items"), "1", "Bob sees only his own item");
      assertEqual(psqlAsAlice("select count(*) from core.item_categories"), "1", "Alice sees only her own category");
      assertEqual(psqlAsBob("select count(*) from core.item_categories"), "0", "Bob sees none of Alice's categories");

      console.log("Verifying items.sku is unique per business (partial unique index)...");
      assertThrows(
        () => psqlAsAlice(`insert into core.items (business_id, sku, name) values ('${aliceBusiness}', 'SKU-1', 'Duplicate SKU')`),
        "a second item with the same SKU in the same business violates the unique index",
      );
      psqlAsAlice(`insert into core.items (business_id, name, kind) values ('${aliceBusiness}', 'Install Service', 'service')`);
      assertEqual(psqlAsAlice("select count(*) from core.items where sku is null"), "1", "a second item with no SKU at all is fine (partial index only covers non-null skus)");

      console.log("Verifying the cross-tenant supplier_party_id trigger...");
      const bobParty = psqlAsBob(`
        insert into core.parties (business_id, name) values ('${bobBusiness}', 'Bolt Supply') returning id;
      `);
      assertThrows(
        () => psqlAsBob(`insert into core.items (business_id, name, supplier_party_id) values ('${bobBusiness}', 'Sneaky', '${aliceSupplier}')`),
        "Bob cannot set supplier_party_id to Alice's party",
      );
      psqlAsBob(`insert into core.items (business_id, name, supplier_party_id) values ('${bobBusiness}', 'Legit', '${bobParty}')`);
      assertEqual(psqlAsBob(`select count(*) from core.items where supplier_party_id = '${bobParty}'`), "1", "Bob can set supplier_party_id to his own party");
      psqlAsAlice(`insert into core.items (business_id, name) values ('${aliceBusiness}', 'No supplier needed')`);
      assertEqual(psqlAsAlice("select count(*) from core.items where name = 'No supplier needed'"), "1", "a null supplier_party_id is always allowed, trigger or no trigger");

      console.log("Verifying item_inventory_attrs and its cross-tenant trigger...");
      psqlAsAlice(`
        insert into core.item_inventory_attrs (item_id, business_id, reorder_point, reorder_quantity, barcode)
        values ('${aliceItem}', '${aliceBusiness}', 10, 50, '012345');
      `);
      assertEqual(psqlAsAlice("select barcode from core.item_inventory_attrs"), "012345", "Alice sees her own item's inventory attrs");
      assertEqual(psqlAsBob("select count(*) from core.item_inventory_attrs"), "0", "Bob sees none of Alice's item inventory attrs");
      const bobItem = psqlAsBob(`select id from core.items where name = 'Legit'`);
      assertThrows(
        () => psqlAsBob(`insert into core.item_inventory_attrs (item_id, business_id) values ('${aliceItem}', '${bobBusiness}')`),
        "Bob cannot attach inventory attrs to Alice's item",
      );
      psqlAsBob(`insert into core.item_inventory_attrs (item_id, business_id) values ('${bobItem}', '${bobBusiness}')`);

      console.log("Verifying the tax rate catalogue...");
      assertEqual(psql("select count(*) from core.tax_rates"), "5", "the five standard GST slabs are seeded");
      assertEqual(psqlAsBob("select count(*) from core.tax_rates"), "5", "the tax rate catalogue is readable by any authenticated user");

      console.log("\nAll core.items RLS checks passed.");
    },
  });
}

main();
