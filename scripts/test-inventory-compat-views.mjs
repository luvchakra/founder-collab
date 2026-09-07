#!/usr/bin/env node
/**
 * Round-trip test for the SP-4 compat views (Epic 4): insert, update, select and delete
 * through each view and assert the effect on the underlying core tables, per this
 * story's own testing requirement (03-STOCKPILOT-MIGRATION.md §4 SP-4: "Any view that
 * can't round-trip is a blocker"). Tenant isolation for the underlying core/inventory
 * tables is already covered by every prior story's own RLS test -- this script is about
 * the views' shape and INSTEAD OF trigger behavior, not RLS.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111";

async function main() {
  await withTestDatabase({
    dbNamePrefix: "inventory_compat_views_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const as = (sql) => psqlAs(ALICE, sql);

      console.log("Seeding a licensed business with an active inventory license...");
      psql(`
        insert into auth.users (id, email) values ('${ALICE}', 'alice@example.com');
        grant usage on schema core to authenticated;
        grant select, insert, update, delete on all tables in schema core to authenticated;
        grant usage on schema inventory to authenticated;
        grant select, insert, update, delete on all tables in schema inventory to authenticated;
      `);
      const business = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Alice Co' from core.account_members where user_id = '${ALICE}'
        returning id;
      `);
      psql(`
        insert into core.business_members (business_id, user_id, role) values ('${business}', '${ALICE}', 'owner');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, '${business}', 'inventory', 'active' from core.businesses where id = '${business}';
      `);
      const warehouse = as(`insert into inventory.warehouses (business_id, name, code) values ('${business}', 'Main', 'MAIN') returning id;`);

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.organizations (join view, UPDATE only)...");
      assertEqual(as(`select name, plan, currency from inventory.organizations where id = '${business}'`), "Alice Co|starter|INR", "the view reads sane defaults before business_settings exists");
      as(`update inventory.organizations set name = 'Alice Co Renamed', plan = 'pro', currency = 'USD', gstin = '27ALICE0001Z5', state = 'Maharashtra' where id = '${business}'`);
      assertEqual(as(`select name from core.businesses where id = '${business}'`), "Alice Co Renamed", "updating the view renamed the underlying business");
      assertEqual(as(`select plan, currency, gstin from core.business_settings where business_id = '${business}'`), "pro|USD|27ALICE0001Z5", "updating the view upserted business_settings");
      assertEqual(as(`select plan, currency, gstin from inventory.organizations where id = '${business}'`), "pro|USD|27ALICE0001Z5", "reading the view back reflects the update");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.organization_members / profiles / categories (simple auto-updatable views)...");
      assertEqual(as(`select role from inventory.organization_members where org_id = '${business}' and user_id = '${ALICE}'`), "owner", "organization_members reads through to business_members");
      as(`update inventory.profiles set full_name = 'Alice Updated' where id = '${ALICE}'`);
      assertEqual(as(`select full_name from core.user_profiles where id = '${ALICE}'`), "Alice Updated", "profiles view writes through to user_profiles");
      const categoryId = as(`insert into inventory.categories (org_id, name) values ('${business}', 'Widgets') returning id;`);
      assertEqual(as(`select name from core.item_categories where id = '${categoryId}'`), "Widgets", "categories view writes through to item_categories");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.customers round-trip...");
      const customerId = as(`
        insert into inventory.customers (org_id, name, email, gstin, billing_address, shipping_address, state)
        values ('${business}', 'Acme Corp', 'acme@example.com', '27ACME0001Z5', '123 Billing St', '456 Shipping Ave', 'Maharashtra')
        returning id;
      `);
      assertEqual(as(`select kind from core.parties where id = '${customerId}'`), "company", "inserting a customer creates a core.parties row");
      assertEqual(as(`select role from core.party_roles where party_id = '${customerId}'`), "customer", "the customer role was recorded");
      assertEqual(as(`select gstin from inventory.customers where id = '${customerId}'`), "27ACME0001Z5", "the view reads back the gstin");
      assertEqual(as(`select billing_address, shipping_address from inventory.customers where id = '${customerId}'`), "123 Billing St|456 Shipping Ave", "the view reads back both addresses");

      as(`update inventory.customers set name = 'Acme Corporation', billing_address = '789 New Billing Rd' where id = '${customerId}'`);
      assertEqual(as(`select name from core.parties where id = '${customerId}'`), "Acme Corporation", "updating the view renamed the party");
      assertEqual(as(`select billing_address from inventory.customers where id = '${customerId}'`), "789 New Billing Rd", "updating the view updated the billing address in place (not a duplicate row)");
      assertEqual(as(`select count(*) from core.addresses where party_id = '${customerId}' and kind = 'billing'`), "1", "the billing address upsert did not create a second row");

      console.log("Verifying a party with two roles survives deleting through just one compat view...");
      as(`insert into core.party_roles (business_id, party_id, role) values ('${business}', '${customerId}', 'supplier')`);
      as(`delete from inventory.customers where id = '${customerId}'`);
      assertEqual(as(`select count(*) from core.parties where id = '${customerId}'`), "1", "the party itself survives -- it still holds the supplier role");
      assertEqual(as(`select count(*) from core.party_roles where party_id = '${customerId}' and role = 'customer'`), "0", "only the customer role was removed");
      as(`delete from core.party_roles where party_id = '${customerId}'`);

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.suppliers round-trip (incl. contact_person split)...");
      const supplierId = as(`
        insert into inventory.suppliers (org_id, name, code, contact_person, gst_number, address, city, state, payment_terms, lead_time_days, rating, min_order_quantity)
        values ('${business}', 'Bolt Supply Co', 'BOLT-1', 'Jane Doe', '27BOLT0001Z5', '1 Industrial Rd', 'Pune', 'Maharashtra', 'Net 30', 14, 4.5, 100)
        returning id;
      `);
      assertEqual(as(`select code, payment_terms, lead_time_days from core.party_supplier_attrs where party_id = '${supplierId}'`), "BOLT-1|Net 30|14", "supplier attrs landed in party_supplier_attrs");
      assertEqual(as(`select first_name, last_name from core.party_contacts where party_id = '${supplierId}' and is_primary`), "Jane|Doe", "contact_person was split into first/last name on a primary contact");
      assertEqual(as(`select contact_person from inventory.suppliers where id = '${supplierId}'`), "Jane Doe", "the view recombines first/last name back into contact_person");
      assertEqual(as(`select gst_number, city from inventory.suppliers where id = '${supplierId}'`), "27BOLT0001Z5|Pune", "gst_number and city read back correctly");

      as(`update inventory.suppliers set rating = 5.0, contact_person = 'John Smith' where id = '${supplierId}'`);
      assertEqual(as(`select rating from core.party_supplier_attrs where party_id = '${supplierId}'`), "5.00", "updating the view updated the rating in place");
      assertEqual(as(`select first_name, last_name from core.party_contacts where party_id = '${supplierId}' and is_primary`), "John|Smith", "updating contact_person updated the same primary contact row, not a new one");

      as(`delete from inventory.suppliers where id = '${supplierId}'`);
      assertEqual(as(`select count(*) from core.parties where id = '${supplierId}'`), "0", "deleting a supplier with no other roles removes the whole party");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.products round-trip...");
      const productId = as(`
        insert into inventory.products (org_id, sku, name, category_id, unit, hsn_code, tax_rate, cost_price, selling_price, reorder_point, reorder_quantity, barcode, brand)
        values ('${business}', 'WID-1', 'Widget', '${categoryId}', 'pcs', '8471', 18, 50, 100, 10, 20, '012345678905', 'Acme Brand')
        returning id;
      `);
      assertEqual(as(`select kind, sku, brand from core.items where id = '${productId}'`), "good|WID-1|Acme Brand", "the product landed in core.items with kind='good'");
      assertEqual(as(`select reorder_point, reorder_quantity, barcode from core.item_inventory_attrs where item_id = '${productId}'`), "10.00|20.00|012345678905", "inventory attrs landed correctly");
      assertEqual(as(`select reorder_point from inventory.products where id = '${productId}'`), "10.00", "the view reads back reorder_point");

      as(`update inventory.products set selling_price = 120, reorder_point = 15 where id = '${productId}'`);
      assertEqual(as(`select selling_price from core.items where id = '${productId}'`), "120.00", "updating the view updated selling_price");
      assertEqual(as(`select reorder_point from core.item_inventory_attrs where item_id = '${productId}'`), "15.00", "updating the view updated reorder_point in place, not a duplicate row");
      assertEqual(as(`select count(*) from core.item_inventory_attrs where item_id = '${productId}'`), "1", "still exactly one attrs row");

      // -----------------------------------------------------------------------
      console.log("Verifying the numbering compat functions match StockPilot's exact format...");
      const soNumber1 = as(`select inventory.next_sales_order_number('${business}')`);
      const soNumber2 = as(`select inventory.next_sales_order_number('${business}')`);
      assertEqual(/^SO\/\d{2}-\d{2}\/0001$/.test(soNumber1), "true", `first sales order number matches SO/YY-YY/0001 format (got ${soNumber1})`);
      assertEqual(/^SO\/\d{2}-\d{2}\/0002$/.test(soNumber2), "true", `second sales order number increments to 0002 (got ${soNumber2})`);
      const invNumber = as(`select inventory.next_sales_invoice_number('${business}')`);
      assertEqual(/^INV\/\d{2}-\d{2}\/0001$/.test(invNumber), "true", `invoice number matches INV/YY-YY/0001 format (got ${invNumber})`);
      const cnNumber = as(`select inventory.next_credit_note_number('${business}')`);
      assertEqual(/^CN\/\d{2}-\d{2}\/0001$/.test(cnNumber), "true", `credit note number matches CN/YY-YY/0001 format (got ${cnNumber})`);
      const rmaNumber = as(`select inventory.next_sales_return_number('${business}')`);
      assertEqual(/^RMA\/\d{2}-\d{2}\/0001$/.test(rmaNumber), "true", `sales return number matches RMA/YY-YY/0001 format (got ${rmaNumber})`);

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.sales_orders / sales_order_items round-trip...");
      as(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${productId}', '${warehouse}', 'inbound', 100)`);
      const customerId2 = as(`insert into inventory.customers (org_id, name) values ('${business}', 'Second Customer') returning id;`);

      const soId = as(`
        insert into inventory.sales_orders (org_id, customer_id, warehouse_id, notes)
        values ('${business}', '${customerId2}', '${warehouse}', 'Rush order')
        returning id;
      `);
      assertEqual(as(`select doc_type, source_module, status from core.documents where id = '${soId}'`), "sales_order|inventory|draft", "the sales order landed as a core.documents row with an auto-minted number");
      assertEqual(as(`select (so.so_number = d.number) from inventory.sales_orders so join core.documents d on d.id = so.id where so.id = '${soId}'`), "t", "so_number matches the auto-minted core.documents.number");
      assertEqual(/^SO\/\d{2}-\d{2}\/0003$/.test(as(`select so_number from inventory.sales_orders where id = '${soId}'`)), "true", "the auto-minted number continues the same sequence (0003, after the two direct next_sales_order_number() calls above)");
      assertEqual(as(`select warehouse_id::text from inventory.sales_orders where id = '${soId}'`), warehouse, "warehouse_id round-trips through source_ref");

      const soItemId = as(`
        insert into inventory.sales_order_items (org_id, sales_order_id, product_id, quantity, unit_price)
        values ('${business}', '${soId}', '${productId}', 3, 120)
        returning id;
      `);
      assertEqual(as(`select hsn_code, tax_rate from core.document_lines where id = '${soItemId}'`), "8471|18.00", "the line item's hsn_code/tax_rate were auto-copied from the product");
      assertEqual(as(`select subtotal from inventory.sales_orders where id = '${soId}'`), "360.00", "the header's subtotal recomputed from the line (3 * 120)");

      as(`update inventory.sales_orders set status = 'confirmed', notes = 'Confirmed rush order' where id = '${soId}'`);
      assertEqual(as(`select status from core.documents where id = '${soId}'`), "confirmed", "updating the view's status updated core.documents (owner permission allows the transition)");

      as(`delete from inventory.sales_order_items where id = '${soItemId}'`);
      assertEqual(as(`select count(*) from core.document_lines where id = '${soItemId}'`), "0", "deleting through the items view removed the line");
      as(`delete from inventory.sales_orders where id = '${soId}'`);
      assertEqual(as(`select count(*) from core.documents where id = '${soId}'`), "0", "deleting through the sales_orders view removed the document");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.sales_invoices resolves customer_gstin/addresses live from the party...");
      const customerId3 = as(`
        insert into inventory.customers (org_id, name, gstin, billing_address, shipping_address)
        values ('${business}', 'Invoice Customer', '27INVC0001Z5', 'Bill Addr', 'Ship Addr')
        returning id;
      `);
      const soId2 = as(`insert into inventory.sales_orders (org_id, customer_id, warehouse_id) values ('${business}', '${customerId3}', '${warehouse}') returning id;`);
      as(`insert into inventory.sales_order_items (org_id, sales_order_id, product_id, quantity, unit_price) values ('${business}', '${soId2}', '${productId}', 1, 100)`);
      as(`update inventory.sales_orders set status = 'confirmed' where id = '${soId2}'`);

      const invoiceId = as(`select inventory.generate_sales_invoice('${soId2}')`);
      assertEqual(as(`select customer_gstin, billing_address, shipping_address from inventory.sales_invoices where id = '${invoiceId}'`), "27INVC0001Z5|Bill Addr|Ship Addr", "the invoice view resolves gstin/addresses live from the customer party, matching the invoice's own party_id");
      assertEqual(as(`select count(*) from inventory.sales_invoice_items where invoice_id = '${invoiceId}'`), "1", "the invoice's line was copied by generate_sales_invoice() and is visible through the compat view");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.purchase_orders / purchase_order_items round-trip (incl. computed tax_amount)...");
      const supplierId2 = as(`insert into inventory.suppliers (org_id, name) values ('${business}', 'PO Supplier') returning id;`);
      const poId = as(`
        insert into inventory.purchase_orders (org_id, supplier_id, warehouse_id)
        values ('${business}', '${supplierId2}', '${warehouse}')
        returning id;
      `);
      const poItemId = as(`
        insert into inventory.purchase_order_items (org_id, purchase_order_id, product_id, quantity, unit_cost)
        values ('${business}', '${poId}', '${productId}', 10, 40)
        returning id;
      `);
      assertEqual(as(`select unit_cost from inventory.purchase_order_items where id = '${poItemId}'`), "40.00", "unit_cost round-trips (mapped from document_lines.unit_price)");
      assertEqual(as(`select cgst_amount, sgst_amount, igst_amount from core.documents where id = '${poId}'`), "0.00|0.00|0.00", "sanity: no tax posted yet");
      as(`update core.documents set cgst_amount = 18, sgst_amount = 18, igst_amount = 0 where id = '${poId}'`);
      assertEqual(as(`select tax_amount from inventory.purchase_orders where id = '${poId}'`), "36.00", "tax_amount is computed as cgst+sgst+igst, matching StockPilot's own cached-sum column");

      as(`update inventory.purchase_orders set status = 'sent' where id = '${poId}'`);
      as(`select inventory.receive_purchase_order_item('${poItemId}', 4)`);
      assertEqual(as(`select received_quantity from inventory.purchase_order_items where id = '${poItemId}'`), "4.00", "receive_purchase_order_item's write is visible back through the compat view");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.credit_notes round-trip...");
      const creditNoteId = as(`
        insert into inventory.credit_notes (org_id, sales_invoice_id, reason, is_full)
        values ('${business}', '${invoiceId}', 'Customer requested partial refund', false)
        returning id;
      `);
      assertEqual(as(`select doc_type from core.documents where id = '${creditNoteId}'`), "credit_note", "the credit note landed as a core.documents row");
      assertEqual(as(`select sales_invoice_id::text, is_full from inventory.credit_notes where id = '${creditNoteId}'`), `${invoiceId}|f`, "sales_invoice_id and is_full round-trip through source_ref");
      assertEqual(as(`select party_id::text from core.documents where id = '${creditNoteId}'`), customerId3, "the credit note inherited the invoice's party automatically");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.debit_notes / proforma_invoices basic round-trip...");
      const debitNoteId = as(`insert into inventory.debit_notes (org_id, sales_invoice_id, reason) values ('${business}', '${invoiceId}', 'Price correction') returning id;`);
      assertEqual(as(`select doc_type from core.documents where id = '${debitNoteId}'`), "debit_note", "debit note landed correctly");
      const proformaId = as(`insert into inventory.proforma_invoices (org_id, sales_order_id, customer_id) values ('${business}', '${soId2}', '${customerId3}') returning id;`);
      assertEqual(as(`select doc_type from core.documents where id = '${proformaId}'`), "proforma_invoice", "proforma invoice landed correctly");

      // -----------------------------------------------------------------------
      console.log("Verifying inventory.sales_returns / sales_return_items round-trip...");
      as(`update inventory.sales_orders set status = 'shipped' where id = '${soId2}'`);
      const returnId = as(`
        insert into inventory.sales_returns (org_id, sales_order_id, sales_invoice_id, notes)
        values ('${business}', '${soId2}', '${invoiceId}', 'Customer returned one unit')
        returning id;
      `);
      assertEqual(as(`select doc_type, status from core.documents where id = '${returnId}'`), "sales_return|draft", "the sales return landed as a draft core.documents row");
      assertEqual(as(`select requested_by from inventory.sales_returns where id = '${returnId}'`), ALICE, "requested_by defaults to the calling user");

      const returnItemId = as(`
        insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price, reason, restock, is_damaged)
        values ('${business}', '${returnId}', '${productId}', 1, 100, 'wrong_item', true, false)
        returning id;
      `);
      assertEqual(as(`select restock, is_damaged, reason from core.document_lines dl join inventory.sales_return_lines_stock srls on srls.document_line_id = dl.id where dl.id = '${returnItemId}'`), "t|f|wrong_item", "the stock-effect fields landed in SP-3a's own sales_return_lines_stock satellite");
      assertEqual(as(`select reason from inventory.sales_return_items where id = '${returnItemId}'`), "wrong_item", "the compat view reads the stock-effect fields back");

      const now = as(`select now()`);
      as(`update inventory.sales_returns set status = 'approved', approved_by = '${ALICE}', approved_at = '${now}', credit_note_id = '${creditNoteId}' where id = '${returnId}'`);
      assertEqual(as(`select status from core.documents where id = '${returnId}'`), "approved", "status update went through");
      assertEqual(as(`select credit_note_id::text from inventory.sales_returns where id = '${returnId}'`), creditNoteId, "credit_note_id round-trips through source_ref");
      assertEqual(as(`select approved_by from inventory.sales_returns where id = '${returnId}'`), ALICE, "approved_by round-trips through source_ref");

      console.log("\nAll SP-4 compat view checks passed.");
    },
  });
}

main();
