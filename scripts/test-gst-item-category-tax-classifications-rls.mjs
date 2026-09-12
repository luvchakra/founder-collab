#!/usr/bin/env node
/**
 * Tenant-isolation + license-gating + permission-gating test for
 * `gst.item_category_tax_classifications` (COMPLY-P1-02.5), plus the two invariants that
 * matter most for this specific table: the confused-deputy guard (a business cannot point
 * `category_id` at another business's own `core.item_categories` row), and the
 * `unique(business_id, category_id)` upsert-not-duplicate behavior.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer, no settings.manage

async function main() {
  await withTestDatabase({
    dbNamePrefix: "gst_item_category_tax_classifications_rls_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsBob = (sql) => psqlAs(BOB, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${BOB}', 'bob@example.com'),
          ('${CAROL}', 'carol@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema gst to authenticated;
        grant select, insert, update, delete on gst.item_category_tax_classifications to authenticated;
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
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${aliceBusiness}';
        insert into core.business_members (business_id, user_id, role) values
          ('${aliceBusiness}', '${ALICE}', 'owner'),
          ('${aliceBusiness}', '${CAROL}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, id, 'gst', 'active' from core.businesses where id in ('${aliceBusiness}', '${bobBusiness}');
      `);

      const aliceCategory = psql(`
        insert into core.item_categories (business_id, name) values ('${aliceBusiness}', 'Kids Apparel') returning id;
      `);
      const bobCategory = psql(`
        insert into core.item_categories (business_id, name) values ('${bobBusiness}', 'Snacks') returning id;
      `);

      const classify = (business, category, taxCategory) => `
        insert into gst.item_category_tax_classifications (business_id, category_id, tax_category)
        values ('${business}', '${category}', '${taxCategory}')
        returning id
      `;

      console.log("Carol (viewer, no settings.manage) cannot classify a category...");
      assertThrows(
        () => psqlAsCarol(classify(aliceBusiness, aliceCategory, "clothing")),
        "Carol lacks settings.manage",
      );

      console.log("Alice (owner) can classify her own category...");
      const classification = psqlAsAlice(classify(aliceBusiness, aliceCategory, "clothing"));
      assertEqual(
        psqlAsAlice(`select tax_category from gst.item_category_tax_classifications where id = '${classification}'`),
        "clothing",
        "the classification was recorded",
      );

      console.log("Confused-deputy guard: Alice cannot point category_id at Bob's own core.item_categories row while claiming business_id = Alice's...");
      assertThrows(
        () => psqlAsAlice(classify(aliceBusiness, bobCategory, "clothing")),
        "category_id does not belong to business_id",
      );

      console.log("A second classification for the SAME business/category is rejected by the unique constraint (use update, not a duplicate insert)...");
      assertThrows(
        () => psqlAsAlice(classify(aliceBusiness, aliceCategory, "groceries")),
        "unique(business_id, category_id)",
      );

      console.log("...but updating the existing row's tax_category works...");
      psqlAsAlice(`update gst.item_category_tax_classifications set tax_category = 'groceries' where id = '${classification}'`);
      assertEqual(
        psqlAsAlice(`select tax_category from gst.item_category_tax_classifications where id = '${classification}'`),
        "groceries",
        "the classification was updated in place",
      );

      console.log("Carol (viewer) can still read the classification...");
      assertEqual(
        psqlAsCarol(`select count(*)::int from gst.item_category_tax_classifications where business_id = '${aliceBusiness}'`),
        "1",
        "read-only members can see the business's own classifications",
      );

      console.log("Carol (viewer) cannot effectively update or delete it -- RLS's own USING clause makes the row invisible to her write entirely, so Postgres matches zero rows and returns successfully (no exception, the same non-throwing shape COMPLY-P0-07.5's own audit entry already documented for a cross-tenant UPDATE) -- assert the row is unchanged via a read as the rightful owner, not via assertThrows...");
      psqlAsCarol(`update gst.item_category_tax_classifications set tax_category = 'saas' where id = '${classification}'`);
      assertEqual(
        psqlAsAlice(`select tax_category from gst.item_category_tax_classifications where id = '${classification}'`),
        "groceries",
        "Carol's update silently matched zero rows -- the classification is unchanged",
      );
      psqlAsCarol(`delete from gst.item_category_tax_classifications where id = '${classification}'`);
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.item_category_tax_classifications where id = '${classification}'`),
        "1",
        "Carol's delete silently matched zero rows -- the classification still exists",
      );

      console.log("Tenant isolation: Bob cannot see or touch Alice's classification...");
      assertEqual(
        psqlAsBob(`select count(*)::int from gst.item_category_tax_classifications where business_id = '${aliceBusiness}'`),
        "0",
        "Bob's RLS-scoped read of Alice's business returns nothing",
      );
      assertThrows(
        () => psqlAsBob(classify(aliceBusiness, aliceCategory, "clothing")),
        "Bob cannot classify against Alice's business_id",
      );

      console.log("Alice (owner) can delete her own classification (a mutable config choice, not append-only evidence)...");
      psqlAsAlice(`delete from gst.item_category_tax_classifications where id = '${classification}'`);
      assertEqual(
        psqlAsAlice(`select count(*)::int from gst.item_category_tax_classifications where id = '${classification}'`),
        "0",
        "the classification was actually removed, unlike an append-only evidence table",
      );

      console.log("All gst.item_category_tax_classifications RLS assertions passed.");
    },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
