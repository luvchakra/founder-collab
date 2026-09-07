#!/usr/bin/env node
/**
 * Behavior test for the inventory procedural layer (Epic 4, story SP-3b), via the shared
 * harness (C-8). Tenant isolation and license gating for these same tables are already
 * covered by test-inventory-rls.mjs (SP-3a) -- this script instead exercises the
 * triggers/RPCs SP-3b adds: the stock-movement state model, the alert engine,
 * stock-transfer RPCs, status-transition permission enforcement, the sales-order/PO
 * workflow functions, and sales-invoice generation.
 */
import { join } from "node:path";
import { withTestDatabase } from "./lib/rls-test-harness.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const STUB_FILE = join(ROOT, "supabase", "tests", "local-stub.sql");

const ALICE = "11111111-1111-1111-1111-111111111111"; // owner -- every permission
const CAROL = "33333333-3333-3333-3333-333333333333"; // viewer -- inventory.view only

async function main() {
  await withTestDatabase({
    dbNamePrefix: "inventory_procedural_test",
    migrationsDir: MIGRATIONS_DIR,
    stubFile: STUB_FILE,
    testFn: async ({ psql, psqlAs, assertEqual, assertThrows }) => {
      const psqlAsAlice = (sql) => psqlAs(ALICE, sql);
      const psqlAsCarol = (sql) => psqlAs(CAROL, sql);

      console.log("Seeding a licensed business, two members, a warehouse pair, a party...");
      psql(`
        insert into auth.users (id, email) values
          ('${ALICE}', 'alice@example.com'),
          ('${CAROL}', 'carol@example.com');
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
      // core.user_business_ids() (the RLS visibility check every table here uses) resolves
      // through ACCOUNT membership, not core.business_members -- business_members is the
      // finer-grained role catalog has_permission() checks, layered on top of that
      // account-wide visibility, not a substitute for it. Carol needs both: an
      // account_members row so the business is visible/writable to her at all, and a
      // business_members row so has_permission() has a role to look up.
      psql(`
        insert into core.account_members (account_id, user_id, role)
        select account_id, '${CAROL}', 'member' from core.businesses where id = '${business}';
        insert into core.business_members (business_id, user_id, role) values
          ('${business}', '${ALICE}', 'owner'),
          ('${business}', '${CAROL}', 'viewer');
        insert into core.licenses (account_id, business_id, module_key, status)
        select account_id, '${business}', 'inventory', 'active' from core.businesses where id = '${business}';
      `);
      const whSource = psqlAsAlice(`insert into inventory.warehouses (business_id, name, code) values ('${business}', 'Source', 'SRC') returning id;`);
      const whDest = psqlAsAlice(`insert into inventory.warehouses (business_id, name, code) values ('${business}', 'Dest', 'DST') returning id;`);
      const party = psqlAsAlice(`insert into core.parties (business_id, name) values ('${business}', 'Acme Customer') returning id;`);

      // ---------------------------------------------------------------------
      // 1. Inventory state model
      // ---------------------------------------------------------------------
      console.log("Verifying apply_stock_movement() for every movement type...");
      const item1 = psqlAsAlice(`insert into core.items (business_id, name) values ('${business}', 'Widget') returning id;`);
      const post = (type, qty, wh) =>
        psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${item1}', '${wh}', '${type}', ${qty});`);
      const level = (col, wh) =>
        psqlAsAlice(`select ${col} from inventory.stock_levels where item_id = '${item1}' and warehouse_id = '${wh}'`);

      post("inbound", 100, whSource);
      assertEqual(level("quantity", whSource), "100.00", "inbound adds to quantity");
      post("reserve", 20, whSource);
      assertEqual(level("reserved", whSource), "20.00", "reserve adds to reserved");
      post("unreserve", 5, whSource);
      assertEqual(level("reserved", whSource), "15.00", "unreserve subtracts from reserved");
      post("damage", 3, whSource);
      assertEqual(level("damaged", whSource), "3.00", "damage adds to damaged");
      post("expired", 2, whSource);
      assertEqual(level("expired", whSource), "2.00", "expired adds to expired");
      post("outbound", 10, whSource);
      assertEqual(level("quantity", whSource), "90.00", "outbound (the else branch) subtracts from quantity");

      post("xfer_ship", 10, whSource);
      assertEqual(level("quantity", whSource), "80.00", "xfer_ship subtracts from the source warehouse's quantity");
      post("xfer_arrive", 10, whDest);
      assertEqual(level("in_transit", whDest), "10.00", "xfer_arrive adds to the destination warehouse's in_transit");
      post("xfer_receive", 6, whDest);
      assertEqual(level("quantity", whDest), "6.00", "xfer_receive adds to the destination's quantity");
      assertEqual(level("in_transit", whDest), "4.00", "xfer_receive subtracts from the destination's in_transit");
      post("xfer_receive_damaged", 4, whDest);
      assertEqual(level("damaged", whDest), "4.00", "xfer_receive_damaged adds to the destination's damaged");
      assertEqual(level("in_transit", whDest), "0.00", "xfer_receive_damaged also subtracts from in_transit");

      const item1b = psqlAsAlice(`insert into core.items (business_id, name) values ('${business}', 'Widget B') returning id;`);
      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${item1b}', '${whSource}', 'xfer_ship', 5);`);
      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${item1b}', '${whDest}', 'xfer_arrive', 5);`);
      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${item1b}', '${whSource}', 'xfer_cancel_ship', 5);`);
      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${item1b}', '${whDest}', 'xfer_cancel_arrive', 5);`);
      assertEqual(psqlAsAlice(`select quantity from inventory.stock_levels where item_id = '${item1b}' and warehouse_id = '${whSource}'`), "0.00", "xfer_cancel_ship reverses the xfer_ship (net zero)");
      assertEqual(psqlAsAlice(`select in_transit from inventory.stock_levels where item_id = '${item1b}' and warehouse_id = '${whDest}'`), "0.00", "xfer_cancel_arrive reverses the xfer_arrive (net zero)");

      // ---------------------------------------------------------------------
      // 1b. Stock-adjustment audit logging (20260907180000)
      // ---------------------------------------------------------------------
      console.log("Verifying stock-adjustment movements write to core.audit_log...");
      post("adjustment", 7, whSource);
      assertEqual(
        psqlAsAlice(`select count(*) from core.audit_log where business_id = '${business}' and action = 'stock.adjusted'`),
        "3",
        "damage/expired/adjustment each logged one stock.adjusted audit entry",
      );
      assertEqual(
        psqlAsAlice(`select count(*) from core.audit_log where business_id = '${business}' and action = 'stock.adjusted' and entity_type = 'stock_movement'`),
        "3",
        "every stock.adjusted entry is entity_type stock_movement",
      );
      assertEqual(
        psqlAsAlice(`select (after->>'type') from core.audit_log where business_id = '${business}' and action = 'stock.adjusted' order by created_at desc limit 1`),
        "adjustment",
        "the latest entry's after-state records the movement type",
      );

      // ---------------------------------------------------------------------
      // 1c. adjust_stock_for_contract() (SP-9)
      // ---------------------------------------------------------------------
      console.log("Verifying adjust_stock_for_contract() -- module-inventory's contract/index.ts RPC...");
      const contractItem = psqlAsAlice(`insert into core.items (business_id, name, sku) values ('${business}', 'Contract Widget', 'CW-1') returning id;`);
      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${contractItem}', '${whSource}', 'inbound', 100);`);
      const contractLevel = (col) =>
        psqlAsAlice(`select ${col} from inventory.stock_levels where item_id = '${contractItem}' and warehouse_id = '${whSource}'`);
      const adjust = (type, qty) =>
        psqlAsAlice(`select inventory.adjust_stock_for_contract('${business}', '${contractItem}', '${whSource}', '${type}', ${qty})`);

      adjust("reserve", 30);
      assertEqual(contractLevel("reserved"), "30.00", "reserve within available succeeds and adds to reserved");
      assertThrows(() => adjust("reserve", 80), "reserve rejected when it exceeds available (70 available, asked for 80)");

      adjust("unreserve", 10);
      assertEqual(contractLevel("reserved"), "20.00", "unreserve within reserved succeeds and subtracts from reserved");
      assertThrows(() => adjust("unreserve", 50), "unreserve rejected when releasing more than is reserved (20 reserved, asked to release 50)");

      adjust("outbound", 60);
      assertEqual(contractLevel("quantity"), "40.00", "outbound within available succeeds and subtracts from quantity");
      assertThrows(() => adjust("outbound", 25), "outbound rejected when it exceeds available (20 available, asked for 25)");
      assertThrows(() => adjust("reserve", 0), "zero quantity is rejected");
      assertThrows(
        () => psqlAsAlice(`select inventory.adjust_stock_for_contract('${business}', '${contractItem}', '${whSource}', 'inbound', 10)`),
        "a movement type outside reserve/unreserve/outbound is rejected",
      );

      // ---------------------------------------------------------------------
      // 2. Alert engine
      // ---------------------------------------------------------------------
      console.log("Verifying the alert engine opens, updates, and auto-resolves...");
      const alertItem = psqlAsAlice(`insert into core.items (business_id, name, sku) values ('${business}', 'Low Stock Widget', 'LSW-1') returning id;`);
      psqlAsAlice(`insert into core.item_inventory_attrs (item_id, business_id, reorder_point) values ('${alertItem}', '${business}', 10);`);
      const alertWh = psqlAsAlice(`insert into inventory.warehouses (business_id, name, code) values ('${business}', 'Alerts WH', 'ALW') returning id;`);

      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${alertItem}', '${alertWh}', 'inbound', 5);`);
      assertEqual(psqlAsAlice(`select count(*) from inventory.alerts where entity_id = (select id from inventory.stock_levels where item_id = '${alertItem}')`), "1", "dropping below the reorder point opens one alert");
      assertEqual(psqlAsAlice(`select severity from inventory.alerts where entity_id = (select id from inventory.stock_levels where item_id = '${alertItem}')`), "warning", "5 > 0 on hand is a warning, not critical");

      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${alertItem}', '${alertWh}', 'outbound', 5);`);
      assertEqual(psqlAsAlice(`select count(*) from inventory.alerts where entity_id = (select id from inventory.stock_levels where item_id = '${alertItem}')`), "1", "still low stock -- the existing alert is updated, not duplicated");
      assertEqual(psqlAsAlice(`select severity from inventory.alerts where entity_id = (select id from inventory.stock_levels where item_id = '${alertItem}')`), "critical", "0 on hand escalates the existing alert to critical");

      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${alertItem}', '${alertWh}', 'inbound', 50);`);
      assertEqual(psqlAsAlice(`select status from inventory.alerts where entity_id = (select id from inventory.stock_levels where item_id = '${alertItem}')`), "resolved", "recovering above the reorder point auto-resolves the alert");

      // ---------------------------------------------------------------------
      // 3. Stock-transfer RPCs
      // ---------------------------------------------------------------------
      console.log("Verifying stock-transfer RPCs...");
      const xferItem = psqlAsAlice(`insert into core.items (business_id, name, sku) values ('${business}', 'Transfer Widget', 'TW-1') returning id;`);
      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${xferItem}', '${whSource}', 'inbound', 20);`);

      const xfer1 = psqlAsAlice(`
        insert into inventory.stock_transfers (business_id, transfer_number, source_warehouse_id, destination_warehouse_id)
        values ('${business}', 'XFER-1', '${whSource}', '${whDest}') returning id;
      `);
      psqlAsAlice(`insert into inventory.stock_transfer_items (business_id, stock_transfer_id, item_id, quantity) values ('${business}', '${xfer1}', '${xferItem}', 30);`);
      // Two separate psql calls, not one semicolon-joined string -- a multi-statement `-c`
      // string runs as one implicit transaction, so if the assertThrows call below failed
      // inside the same string, these two status updates would roll back with it.
      psqlAsAlice(`update inventory.stock_transfers set status = 'requested' where id = '${xfer1}';`);
      psqlAsAlice(`update inventory.stock_transfers set status = 'approved' where id = '${xfer1}';`);
      assertThrows(
        () => psqlAsAlice(`select inventory.ship_stock_transfer('${xfer1}')`),
        "ship_stock_transfer rejects shipping more than the available stock",
      );

      psqlAsAlice(`delete from inventory.stock_transfer_items where stock_transfer_id = '${xfer1}';`);
      psqlAsAlice(`insert into inventory.stock_transfer_items (business_id, stock_transfer_id, item_id, quantity) values ('${business}', '${xfer1}', '${xferItem}', 12);`);
      psqlAsAlice(`select inventory.ship_stock_transfer('${xfer1}')`);
      assertEqual(psqlAsAlice(`select status from inventory.stock_transfers where id = '${xfer1}'`), "in_transit", "a valid ship moves the transfer to in_transit");
      assertEqual(psqlAsAlice(`select quantity from inventory.stock_levels where item_id = '${xferItem}' and warehouse_id = '${whSource}'`), "8.00", "shipping posts an xfer_ship against the source (20 - 12)");
      assertEqual(psqlAsAlice(`select in_transit from inventory.stock_levels where item_id = '${xferItem}' and warehouse_id = '${whDest}'`), "12.00", "shipping posts an xfer_arrive against the destination");

      const xferLineId = psqlAsAlice(`select id from inventory.stock_transfer_items where stock_transfer_id = '${xfer1}'`);
      psqlAsAlice(`select inventory.receive_stock_transfer_item('${xferLineId}', 8, 2)`);
      assertEqual(psqlAsAlice(`select status from inventory.stock_transfers where id = '${xfer1}'`), "in_transit", "a partial receipt (10 of 12) leaves the transfer in_transit");
      assertEqual(psqlAsAlice(`select quantity from inventory.stock_levels where item_id = '${xferItem}' and warehouse_id = '${whDest}'`), "8.00", "the received portion lands on the destination's quantity");
      assertEqual(psqlAsAlice(`select damaged from inventory.stock_levels where item_id = '${xferItem}' and warehouse_id = '${whDest}'`), "2.00", "the damaged portion lands on the destination's damaged");
      assertThrows(
        () => psqlAsAlice(`select inventory.receive_stock_transfer_item('${xferLineId}', 5, 0)`),
        "receiving more than the shipped quantity is rejected",
      );
      psqlAsAlice(`select inventory.receive_stock_transfer_item('${xferLineId}', 2, 0)`);
      assertEqual(psqlAsAlice(`select status from inventory.stock_transfers where id = '${xfer1}'`), "received", "receiving the remainder (12 of 12) completes the transfer");

      const xfer2 = psqlAsAlice(`
        insert into inventory.stock_transfers (business_id, transfer_number, source_warehouse_id, destination_warehouse_id)
        values ('${business}', 'XFER-2', '${whSource}', '${whDest}') returning id;
      `);
      psqlAsAlice(`select inventory.cancel_stock_transfer('${xfer2}')`);
      assertEqual(psqlAsAlice(`select status from inventory.stock_transfers where id = '${xfer2}'`), "cancelled", "cancelling a draft transfer is a pure status flip");

      const xfer3 = psqlAsAlice(`
        insert into inventory.stock_transfers (business_id, transfer_number, source_warehouse_id, destination_warehouse_id)
        values ('${business}', 'XFER-3', '${whSource}', '${whDest}') returning id;
      `);
      psqlAsAlice(`insert into inventory.stock_transfer_items (business_id, stock_transfer_id, item_id, quantity) values ('${business}', '${xfer3}', '${xferItem}', 5);`);
      psqlAsAlice(`update inventory.stock_transfers set status = 'requested' where id = '${xfer3}'; update inventory.stock_transfers set status = 'approved' where id = '${xfer3}';`);
      psqlAsAlice(`select inventory.ship_stock_transfer('${xfer3}')`);
      const qtyBeforeCancel = psqlAsAlice(`select quantity from inventory.stock_levels where item_id = '${xferItem}' and warehouse_id = '${whSource}'`);
      psqlAsAlice(`select inventory.cancel_stock_transfer('${xfer3}')`);
      assertEqual(psqlAsAlice(`select status from inventory.stock_transfers where id = '${xfer3}'`), "cancelled", "cancelling an in-transit transfer succeeds");
      assertEqual(
        psqlAsAlice(`select quantity from inventory.stock_levels where item_id = '${xferItem}' and warehouse_id = '${whSource}'`),
        String((Number(qtyBeforeCancel) + 5).toFixed(2)),
        "cancelling an in-transit transfer reverses the shipped quantity back to the source",
      );
      assertEqual(psqlAsAlice(`select in_transit from inventory.stock_levels where item_id = '${xferItem}' and warehouse_id = '${whDest}'`), "0.00", "cancelling an in-transit transfer clears the destination's in_transit");
      assertThrows(
        () => psqlAsAlice(`select inventory.cancel_stock_transfer('${xfer1}')`),
        "an already-received transfer can no longer be cancelled",
      );

      // ---------------------------------------------------------------------
      // 4. Status-transition permission enforcement
      // ---------------------------------------------------------------------
      console.log("Verifying status-transition permission enforcement...");
      const soItem = psqlAsAlice(`insert into core.items (business_id, name) values ('${business}', 'SO Widget') returning id;`);
      psqlAsAlice(`insert into inventory.stock_movements (business_id, item_id, warehouse_id, type, quantity) values ('${business}', '${soItem}', '${whSource}', 'inbound', 50);`);
      // A dedicated document for the permission-trigger test itself, via a raw status
      // UPDATE (not confirm_sales_order()) -- keeps this test isolated from the stock
      // side effects confirm_sales_order() would post, which section 5 below tests for real.
      const soPerm = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, source_ref, party_id)
        values ('${business}', 'sales_order', 'inventory', jsonb_build_object('warehouse_id', '${whSource}'), '${party}')
        returning id;
      `);
      psqlAsAlice(`insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${business}', '${soPerm}', '${soItem}', 1);`);

      assertThrows(
        () => psqlAsCarol(`update core.documents set status = 'confirmed' where id = '${soPerm}'`),
        "a viewer lacks sales_orders.confirm and cannot confirm a sales order",
      );
      assertEqual(psqlAsAlice(`select status from core.documents where id = '${soPerm}'`), "draft", "the rejected transition left status unchanged");
      psqlAsCarol(`update core.documents set notes = 'just checking' where id = '${soPerm}'`);
      assertEqual(psqlAsAlice(`select notes from core.documents where id = '${soPerm}'`), "just checking", "a viewer CAN update a non-status column -- the trigger only gates status changes");
      psqlAsAlice(`update core.documents set status = 'confirmed' where id = '${soPerm}'`);
      assertEqual(psqlAsAlice(`select status from core.documents where id = '${soPerm}'`), "confirmed", "an owner (has sales_orders.confirm via the blanket owner grant) can confirm it");

      const xfer4 = psqlAsAlice(`
        insert into inventory.stock_transfers (business_id, transfer_number, source_warehouse_id, destination_warehouse_id)
        values ('${business}', 'XFER-4', '${whSource}', '${whDest}') returning id;
      `);
      assertThrows(
        () => psqlAsCarol(`update inventory.stock_transfers set status = 'requested' where id = '${xfer4}'`),
        "a viewer lacks stock_transfers.edit and cannot request a stock transfer",
      );
      psqlAsAlice(`update inventory.stock_transfers set status = 'requested' where id = '${xfer4}'`);
      assertEqual(psqlAsAlice(`select status from inventory.stock_transfers where id = '${xfer4}'`), "requested", "an owner can request it");

      // ---------------------------------------------------------------------
      // 5. Sales-order / PO workflow functions
      // ---------------------------------------------------------------------
      console.log("Verifying the sales-order workflow functions...");
      const soInsufficient = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, source_ref, party_id)
        values ('${business}', 'sales_order', 'inventory', jsonb_build_object('warehouse_id', '${whSource}'), '${party}')
        returning id;
      `);
      psqlAsAlice(`insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${business}', '${soInsufficient}', '${soItem}', 999);`);
      assertThrows(
        () => psqlAsAlice(`select inventory.confirm_sales_order('${soInsufficient}')`),
        "confirm_sales_order rejects an order exceeding available stock",
      );

      const so1 = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, source_ref, party_id)
        values ('${business}', 'sales_order', 'inventory', jsonb_build_object('warehouse_id', '${whSource}'), '${party}')
        returning id;
      `);
      psqlAsAlice(`insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${business}', '${so1}', '${soItem}', 5);`);
      psqlAsAlice(`select inventory.confirm_sales_order('${so1}')`);
      assertEqual(psqlAsAlice(`select status from core.documents where id = '${so1}'`), "confirmed", "confirm_sales_order moves a draft order to confirmed");
      assertEqual(psqlAsAlice(`select reserved from inventory.stock_levels where item_id = '${soItem}' and warehouse_id = '${whSource}'`), "5.00", "confirming reserves the ordered quantity");

      psqlAsAlice(`select inventory.ship_sales_order('${so1}')`);
      assertEqual(psqlAsAlice(`select status from core.documents where id = '${so1}'`), "shipped", "ship_sales_order moves a confirmed order to shipped");
      assertEqual(psqlAsAlice(`select reserved from inventory.stock_levels where item_id = '${soItem}' and warehouse_id = '${whSource}'`), "0.00", "shipping releases the reservation made at confirmation");
      assertEqual(psqlAsAlice(`select quantity from inventory.stock_levels where item_id = '${soItem}' and warehouse_id = '${whSource}'`), "45.00", "shipping posts an outbound movement for the shipped quantity (50 - 5)");
      assertThrows(
        () => psqlAsAlice(`select inventory.cancel_sales_order('${so1}')`),
        "a shipped sales order can no longer be cancelled",
      );

      const so2 = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, source_ref, party_id)
        values ('${business}', 'sales_order', 'inventory', jsonb_build_object('warehouse_id', '${whSource}'), '${party}')
        returning id;
      `);
      psqlAsAlice(`insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${business}', '${so2}', '${soItem}', 5);`);
      psqlAsAlice(`select inventory.confirm_sales_order('${so2}')`);
      assertEqual(psqlAsAlice(`select reserved from inventory.stock_levels where item_id = '${soItem}' and warehouse_id = '${whSource}'`), "5.00", "confirming a second order reserves its quantity");
      psqlAsAlice(`select inventory.cancel_sales_order('${so2}')`);
      assertEqual(psqlAsAlice(`select status from core.documents where id = '${so2}'`), "cancelled", "cancel_sales_order cancels a confirmed order");
      assertEqual(psqlAsAlice(`select reserved from inventory.stock_levels where item_id = '${soItem}' and warehouse_id = '${whSource}'`), "0.00", "cancelling a confirmed (non-draft) order releases its reservation");

      console.log("Verifying receive_purchase_order_item()...");
      const poItem = psqlAsAlice(`insert into core.items (business_id, name) values ('${business}', 'PO Widget') returning id;`);
      const po1 = psqlAsAlice(`
        insert into core.documents (business_id, doc_type, source_module, source_ref, party_id, status)
        values ('${business}', 'purchase_order', 'inventory', jsonb_build_object('warehouse_id', '${whSource}'), '${party}', 'sent')
        returning id;
      `);
      const poLine = psqlAsAlice(`insert into core.document_lines (business_id, document_id, item_id, quantity) values ('${business}', '${po1}', '${poItem}', 20) returning id;`);
      psqlAsAlice(`select inventory.receive_purchase_order_item('${poLine}', 12)`);
      assertEqual(psqlAsAlice(`select status from core.documents where id = '${po1}'`), "partially_received", "receiving less than ordered (12 of 20) leaves the PO partially_received");
      assertThrows(
        () => psqlAsAlice(`select inventory.receive_purchase_order_item('${poLine}', 20)`),
        "receiving more than the ordered quantity is rejected",
      );
      psqlAsAlice(`select inventory.receive_purchase_order_item('${poLine}', 8)`);
      assertEqual(psqlAsAlice(`select status from core.documents where id = '${po1}'`), "received", "receiving the remainder (20 of 20) completes the PO");
      assertEqual(psqlAsAlice(`select quantity from inventory.stock_levels where item_id = '${poItem}' and warehouse_id = '${whSource}'`), "20.00", "each receipt posted an inbound movement");

      // ---------------------------------------------------------------------
      // 6. Sales-invoice generation
      // ---------------------------------------------------------------------
      console.log("Verifying generate_sales_invoice()...");
      const invoiceId = psqlAsAlice(`select inventory.generate_sales_invoice('${so1}')`);
      assertEqual(psqlAsAlice(`select doc_type from core.documents where id = '${invoiceId}'`), "invoice", "generate_sales_invoice creates an invoice document");
      assertEqual(psqlAsAlice(`select party_id from core.documents where id = '${invoiceId}'`), party, "the invoice copies the sales order's party");
      assertEqual(psqlAsAlice(`select left(number, 4) from core.documents where id = '${invoiceId}'`), "INV/", "the invoice number is minted via core.next_number() with the INV prefix");
      assertEqual(psqlAsAlice(`select count(*) from core.document_lines where document_id = '${invoiceId}'`), "1", "the invoice's lines are copied from the sales order");
      assertEqual(
        psqlAsAlice(`select dl2.item_id from core.document_lines dl2 where dl2.document_id = '${invoiceId}'`),
        soItem,
        "the copied line references the same item",
      );
      assertThrows(
        () => psqlAsAlice(`select inventory.generate_sales_invoice('${so1}')`),
        "a second invoice for the same sales order is rejected",
      );
      assertThrows(
        () => psqlAsAlice(`select inventory.generate_sales_invoice('${soInsufficient}')`),
        "an invoice cannot be generated from a still-draft sales order",
      );

      console.log("\nAll inventory procedural layer checks passed.");
    },
  });
}

main();
