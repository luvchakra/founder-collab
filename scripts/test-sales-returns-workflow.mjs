#!/usr/bin/env node
/**
 * Behavior test for the sales-returns approval workflow (SP-7d's returns-workflow
 * migration): create_credit_note()'s full/partial tax split, approve_sales_return()'s
 * restock/damage stock movements + credit-note issuance + over-return cap, the
 * server-resolved sales_invoice_id on creation, and permission/tenant gating for the
 * whole flow. Tenant isolation for the underlying tables themselves is already covered
 * by test-inventory-rls.mjs/test-inventory-procedural.mjs -- this script is scoped to
 * what this migration actually adds.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner -- every permission
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer -- no returns permissions
const BOB = "44444444-4444-4444-4444-444444444444"; // owner of a separate business

async function main() {
  await withTestDatabase({
    dbNamePrefix: "sales_returns_workflow_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const asAlice = (sql) => psqlAs(ALICE, sql);
      const asCarol = (sql) => psqlAs(CAROL, sql);
      const asBob = (sql) => psqlAs(BOB, sql);

      console.log("Seeding two licensed businesses, a warehouse, an item, and a customer...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${CAROL}', 'carol@example.com'),
          ('${BOB}', 'bob@example.com');
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
      const bobBusiness = psql(`
        insert into core.businesses (account_id, name)
        select account_id, 'Bob Co' from core.account_members where user_id = '${BOB}'
        returning id;
      `);
      psql(`
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${business}';
        insert into core.business_members (business_id, user_id, role) values
          ('${business}', '${ALICE}', 'owner'),
          ('${business}', '${CAROL}', 'viewer'),
          ('${bobBusiness}', '${BOB}', 'owner');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, '${business}', 'inventory', 'active' from core.businesses where id = '${business}';
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, '${bobBusiness}', 'inventory', 'active' from core.businesses where id = '${bobBusiness}';
      `);
      const wh = asAlice(`insert into inventory.warehouses (business_id, name, code) values ('${business}', 'Main', 'MN') returning id;`);
      const customer = asAlice(`insert into core.parties (business_id, name) values ('${business}', 'Retail Customer') returning id;`);
      const item = asAlice(`insert into core.items (business_id, name, sku) values ('${business}', 'Widget', 'WID-1') returning id;`);
      asAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${item}', '${wh}', 'inbound', 100);`);

      const makeShippedSo = (qty) => {
        const so = asAlice(`
          insert into core.documents (business_id, doc_type, source_module, source_ref, party_id)
          values ('${business}', 'sales_order', 'inventory', jsonb_build_object('warehouse_id', '${wh}'), '${customer}')
          returning id;
        `);
        asAlice(`insert into core.document_lines (business_id, document_id, item_id, quantity, unit_price) values ('${business}', '${so}', '${item}', ${qty}, 50);`);
        asAlice(`select inventory.confirm_sales_order('${so}')`);
        asAlice(`select inventory.ship_sales_order('${so}')`);
        return so;
      };

      // ---------------------------------------------------------------------
      // 1. Creation: server-resolved sales_invoice_id, SO-state + tenant guards
      // ---------------------------------------------------------------------
      console.log("Verifying sales-return creation guards...");
      const soNoInvoice = makeShippedSo(10);
      const returnBeforeInvoiceCheck = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${soNoInvoice}') returning id;`);
      assertEqual(
        asAlice(`select sales_invoice_id from inventory.sales_returns where id = '${returnBeforeInvoiceCheck}'`),
        "",
        "creating a return succeeds even before an invoice exists, with sales_invoice_id left null",
      );

      const draftSoRawInsert = asAlice(`
        insert into core.documents (business_id, doc_type, source_module, source_ref, party_id, status)
        values ('${business}', 'sales_order', 'inventory', jsonb_build_object('warehouse_id', '${wh}'), '${customer}', 'draft')
        returning id;
      `);
      assertThrows(
        () => asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${draftSoRawInsert}')`),
        "a return cannot be created against a still-draft sales order",
      );

      assertThrows(
        () => asBob(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${bobBusiness}', '${soNoInvoice}')`),
        "a business cannot create a return against another business's sales order",
      );

      // Creating a draft is plain CRUD, gated only by the uniform "tenant AND licensed"
      // base RLS (ADR-8) -- any business member can open a draft return, same as any
      // member can open a draft sales/purchase order. sales_returns.create is enforced
      // by the status-transition trigger below instead, matching sales_orders.edit's own
      // precedent (test-inventory-procedural.mjs's own viewer-can-edit-notes assertion).
      const carolReturn = asCarol(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${soNoInvoice}') returning id;`);
      assertEqual(asCarol(`select status from inventory.sales_returns where id = '${carolReturn}'`), "draft", "a viewer CAN open a draft return -- ordinary CRUD isn't permission-gated at the base RLS layer");

      // ---------------------------------------------------------------------
      // 2. approve_sales_return(): requires an invoice, restock/damage movements,
      // credit-note issuance, and the over-return cap.
      // ---------------------------------------------------------------------
      console.log("Verifying approve_sales_return() requires an invoice first...");
      const returnNoInvoice = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${soNoInvoice}') returning id;`);
      asAlice(`insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price) values ('${business}', '${returnNoInvoice}', '${item}', 2, 50);`);
      assertThrows(
        () => asAlice(`select inventory.approve_sales_return('${returnNoInvoice}')`),
        "approve_sales_return refuses to run before the order's invoice is generated",
      );

      console.log("Verifying restock (good) + credit-only + damaged lines on a real return...");
      const so1 = makeShippedSo(10);
      const invoice1 = asAlice(`select inventory.generate_sales_invoice('${so1}')`);

      const return1 = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${so1}') returning id;`);
      assertEqual(asAlice(`select sales_invoice_id from inventory.sales_returns where id = '${return1}'`), invoice1, "the return's sales_invoice_id is resolved server-side to the order's invoice");

      asAlice(`insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price, restock, is_damaged) values ('${business}', '${return1}', '${item}', 3, 50, true, false);`);

      const qtyBefore = asAlice(`select quantity from inventory.stock_levels where item_id = '${item}' and warehouse_id = '${wh}'`);
      asAlice(`select inventory.approve_sales_return('${return1}')`);
      assertEqual(asAlice(`select status from inventory.sales_returns where id = '${return1}'`), "approved", "approve_sales_return moves a draft return to approved");
      assertEqual(
        asAlice(`select quantity from inventory.stock_levels where item_id = '${item}' and warehouse_id = '${wh}'`),
        (Number(qtyBefore) + 3).toFixed(2),
        "a good-condition restock line posts a 'return' movement that adds back to on-hand quantity",
      );

      const creditNoteId = asAlice(`select credit_note_id from inventory.sales_returns where id = '${return1}'`);
      assertEqual(asAlice(`select sales_invoice_id from inventory.credit_notes where id = '${creditNoteId}'`), invoice1, "the issued credit note is against the order's invoice");
      assertEqual(asAlice(`select subtotal from inventory.credit_notes where id = '${creditNoteId}'`), "150.00", "the credit note's subtotal is the returned quantity * unit price (3 * 50)");
      assertEqual(asAlice(`select is_full from inventory.credit_notes where id = '${creditNoteId}'`), "f", "a partial return (150 of the invoice's 500 subtotal) issues a partial credit note");

      console.log("Verifying a damaged restock line routes into the damaged bucket, not on-hand...");
      const so3 = makeShippedSo(2);
      asAlice(`select inventory.generate_sales_invoice('${so3}')`);
      const return3 = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${so3}') returning id;`);
      asAlice(`insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price, restock, is_damaged) values ('${business}', '${return3}', '${item}', 2, 50, true, true);`);
      const damagedBefore = asAlice(`select damaged from inventory.stock_levels where item_id = '${item}' and warehouse_id = '${wh}'`);
      asAlice(`select inventory.approve_sales_return('${return3}')`);
      assertEqual(
        asAlice(`select damaged from inventory.stock_levels where item_id = '${item}' and warehouse_id = '${wh}'`),
        (Number(damagedBefore) + 2).toFixed(2),
        "a damaged restock line posts a 'damage' movement into the damaged bucket",
      );
      const creditNote3 = asAlice(`select credit_note_id from inventory.sales_returns where id = '${return3}'`);
      assertEqual(asAlice(`select is_full from inventory.credit_notes where id = '${creditNote3}'`), "t", "a return covering an order's entire invoiced value issues a full credit note");

      console.log("Verifying a credit-only line posts no stock movement at all...");
      const so4 = makeShippedSo(4);
      asAlice(`select inventory.generate_sales_invoice('${so4}')`);
      const return4 = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${so4}') returning id;`);
      asAlice(`insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price, restock, is_damaged) values ('${business}', '${return4}', '${item}', 2, 50, false, false);`);
      const qtyBeforeCreditOnly = asAlice(`select quantity from inventory.stock_levels where item_id = '${item}' and warehouse_id = '${wh}'`);
      asAlice(`select inventory.approve_sales_return('${return4}')`);
      assertEqual(
        asAlice(`select quantity from inventory.stock_levels where item_id = '${item}' and warehouse_id = '${wh}'`),
        qtyBeforeCreditOnly,
        "a credit-only (restock=false) line leaves on-hand quantity unchanged",
      );

      console.log("Verifying the over-return cap...");
      const so5 = makeShippedSo(3);
      asAlice(`select inventory.generate_sales_invoice('${so5}')`);
      const return5a = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${so5}') returning id;`);
      asAlice(`insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price) values ('${business}', '${return5a}', '${item}', 3, 50);`);
      asAlice(`select inventory.approve_sales_return('${return5a}')`);
      const return5b = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${so5}') returning id;`);
      asAlice(`insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price) values ('${business}', '${return5b}', '${item}', 1, 50);`);
      assertThrows(
        () => asAlice(`select inventory.approve_sales_return('${return5b}')`),
        "approving a second return that exceeds what was actually sold (3 sold, 3 already returned) is rejected",
      );

      // ---------------------------------------------------------------------
      // 3. Status-transition permission gating
      // ---------------------------------------------------------------------
      console.log("Verifying status-transition permission gating...");
      const so6 = makeShippedSo(2);
      asAlice(`select inventory.generate_sales_invoice('${so6}')`);
      const return6 = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${so6}') returning id;`);
      asAlice(`insert into inventory.sales_return_items (org_id, sales_return_id, product_id, quantity, unit_price, restock) values ('${business}', '${return6}', '${item}', 1, 50, false);`);
      assertThrows(
        () => asCarol(`update inventory.sales_returns set status = 'approved' where id = '${return6}'`),
        "a viewer lacks sales_returns.approve and cannot approve a return directly",
      );
      assertThrows(
        () => asCarol(`select inventory.approve_sales_return('${return6}')`),
        "a viewer cannot approve a return via the RPC either (the RPC's own status UPDATE hits the same trigger)",
      );
      asAlice(`select inventory.approve_sales_return('${return6}')`);
      assertThrows(
        () => asCarol(`update inventory.sales_returns set status = 'completed' where id = '${return6}'`),
        "a viewer lacks sales_returns.approve and cannot complete an approved return",
      );
      asAlice(`update inventory.sales_returns set status = 'completed' where id = '${return6}'`);
      assertEqual(asAlice(`select status from inventory.sales_returns where id = '${return6}'`), "completed", "an owner can complete an approved return");
      assertThrows(
        () => asAlice(`select inventory.approve_sales_return('${return6}')`),
        "an already-approved/completed return cannot be approved again",
      );

      const so7 = makeShippedSo(1);
      const return7 = asAlice(`insert into inventory.sales_returns (org_id, sales_order_id) values ('${business}', '${so7}') returning id;`);
      assertThrows(
        () => asCarol(`update inventory.sales_returns set status = 'cancelled' where id = '${return7}'`),
        "a viewer lacks sales_returns.cancel and cannot cancel a draft return",
      );
      asAlice(`update inventory.sales_returns set status = 'cancelled' where id = '${return7}'`);
      assertEqual(asAlice(`select status from inventory.sales_returns where id = '${return7}'`), "cancelled", "an owner can cancel a draft return");

      // ---------------------------------------------------------------------
      // 4. create_credit_note() directly, full and partial, and its own guards
      // ---------------------------------------------------------------------
      console.log("Verifying create_credit_note() directly...");
      const so8 = makeShippedSo(2);
      const invoice8 = asAlice(`select inventory.generate_sales_invoice('${so8}')`);
      const cnPartial = asAlice(`select inventory.create_credit_note('${invoice8}', false, 40, 'Damaged on arrival')`);
      assertEqual(asAlice(`select subtotal from inventory.credit_notes where id = '${cnPartial}'`), "40.00", "a partial credit note takes the caller's own subtotal");
      assertThrows(
        () => asAlice(`select inventory.create_credit_note('${invoice8}', false, 1000)`),
        "create_credit_note rejects crediting more than the invoice's remaining subtotal",
      );
      const cnFull = asAlice(`select inventory.create_credit_note('${invoice8}', true)`);
      assertEqual(asAlice(`select subtotal from inventory.credit_notes where id = '${cnFull}'`), "60.00", "a full credit note reverses exactly whatever remains uncredited (100 - 40)");
      assertThrows(
        () => asAlice(`select inventory.create_credit_note('${invoice8}', true)`),
        "an invoice that's already fully credited cannot be credited again",
      );

      console.log("\nAll sales-returns workflow checks passed.");
    },
  });
}

main();
