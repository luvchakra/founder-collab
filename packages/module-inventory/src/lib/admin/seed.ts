import { randomBytes } from "node:crypto";
import { createAdminClient as createInventoryAdminClient } from "../../db/admin";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import {
  createSeedBatch,
  trackSeedRecords,
  finalizeSeedBatch,
  deleteAllSeedDataForBusiness,
} from "@cofounderai/core/admin/demo-seed-tracking";
import { computeLineGst, roundCurrency, stateCodeFromName } from "@cofounderai/core/lib/gst";

function runTag(): string {
  return randomBytes(3).toString("hex");
}

/**
 * Platform-admin demo-data seeder -- writes on behalf of `targetUserId` into
 * `businessId` via the service-role client (the admin isn't a member of the target
 * business, so the normal RLS-scoped mutations in lib/{products,suppliers,...}/
 * mutations.ts can't be reused here). A trimmed, representative slice of
 * stockpilot-ai-ops's own much larger admin-seed-actions.ts dataset -- 2 warehouses, 2
 * categories, 2 suppliers, 2 customers, 6 products (seeded with stock so the alert
 * engine fires naturally for the ones below their reorder point), one pending purchase
 * order, and one draft sales order. Enough to populate every master-data list page and
 * the operations dashboard for a demo, without hand-replicating every one of the
 * original's dozens of order-status permutations.
 *
 * Every row inserted is recorded via trackSeedRecords() so deleteDemoData() can remove
 * exactly this run's rows later, never a business's real data.
 */
export async function seedDemoData(
  businessId: string,
  targetUserId: string,
  requestedBy: string,
): Promise<{ recordCount: number; businessName: string }> {
  const inventory = createInventoryAdminClient();
  const core = createCoreAdminClient({ schema: "core" });

  const { data: business, error: businessError } = await core
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .single();
  if (businessError) throw businessError;

  const { data: settings } = await core
    .from("business_settings")
    .select("state")
    .eq("business_id", businessId)
    .maybeSingle();
  const businessState = settings?.state ?? "Karnataka";
  // computeLineGst wants a 2-digit GST state code, not the state name -- seller and
  // buyer are given the same state (intrastate, CGST+SGST split) for simplicity.
  const stateCode = stateCodeFromName(businessState) ?? stateCodeFromName("Karnataka");

  const tag = runTag();
  const batchId = await createSeedBatch(businessId, targetUserId, requestedBy);
  let recordCount = 0;

  async function insertTracked<T extends { id: string }>(
    schema: "inventory" | "core",
    table: string,
    client: ReturnType<typeof createInventoryAdminClient> | ReturnType<typeof createCoreAdminClient>,
    rows: Record<string, unknown>[],
  ): Promise<T[]> {
    const { data, error } = await client.from(table).insert(rows).select();
    if (error) throw new Error(`insert ${schema}.${table} failed: ${error.message}`);
    const inserted = (data ?? []) as T[];
    await trackSeedRecords(
      batchId,
      schema,
      table === "products" || table === "suppliers" || table === "customers"
        ? // These compat views resolve to a different real table name than the view
          // itself -- track the real core table so deleteAllSeedDataForBusiness()'s
          // schema/table lookup (core.items / core.parties) actually finds them.
          table === "products"
          ? "items"
          : "parties"
        : table === "categories"
          ? "item_categories"
          : table === "purchase_orders" || table === "sales_orders"
            ? "documents"
            : table,
      inserted.map((r) => r.id),
    );
    recordCount += inserted.length;
    return inserted;
  }

  // --- Warehouses ---------------------------------------------------------
  const warehouses = await insertTracked<{ id: string; name: string }>("inventory", "warehouses", inventory, [
    { business_id: businessId, name: "Main Warehouse", code: `MAIN-${tag}`, city: "Bengaluru", state: businessState },
    { business_id: businessId, name: "Secondary Warehouse", code: `SEC-${tag}`, city: "Pune", state: businessState },
  ]);
  const mainWarehouse = warehouses[0]!;

  // --- Categories -----------------------------------------------------------
  const categories = await insertTracked<{ id: string }>("core", "categories", inventory, [
    { org_id: businessId, name: "Electronics" },
    { org_id: businessId, name: "Office Supplies" },
  ]);

  // --- Suppliers / customers (core.parties) ----------------------------------
  const suppliers = await insertTracked<{ id: string }>("core", "suppliers", inventory, [
    { org_id: businessId, name: "Acme Components Pvt Ltd", email: "sales@acme.example", phone: "+91 98765 43210", state: businessState },
    { org_id: businessId, name: "Bharat Traders", email: "orders@bharattraders.example", phone: "+91 91234 56789", state: businessState },
  ]);
  const customers = await insertTracked<{ id: string }>("core", "customers", inventory, [
    { org_id: businessId, name: "Nimbus Retail", email: "purchasing@nimbusretail.example", state: businessState },
    { org_id: businessId, name: "Blue Horizon Stores", email: "accounts@bluehorizon.example", state: businessState },
  ]);

  // --- Products (some below reorder point, to exercise the alert engine) -----
  const productDefs = [
    { name: "Wireless Mouse", sku: `WM-${tag}`, cost: 450, price: 699, reorderPoint: 20, stock: 8 },
    { name: "USB-C Cable 1m", sku: `UC-${tag}`, cost: 90, price: 199, reorderPoint: 50, stock: 12 },
    { name: "Mechanical Keyboard", sku: `MK-${tag}`, cost: 1800, price: 2999, reorderPoint: 10, stock: 25 },
    { name: "A4 Paper Ream", sku: `AP-${tag}`, cost: 220, price: 320, reorderPoint: 30, stock: 60 },
    { name: "Stapler", sku: `ST-${tag}`, cost: 60, price: 120, reorderPoint: 15, stock: 3 },
    { name: "Whiteboard Marker Set", sku: `WB-${tag}`, cost: 150, price: 249, reorderPoint: 25, stock: 40 },
  ];
  const products = await insertTracked<{ id: string; sku: string }>("core", "products", inventory, [
    { org_id: businessId, sku: productDefs[0]!.sku, name: productDefs[0]!.name, category_id: categories[0]!.id, cost_price: productDefs[0]!.cost, selling_price: productDefs[0]!.price, reorder_point: productDefs[0]!.reorderPoint, tax_rate: 18 },
    { org_id: businessId, sku: productDefs[1]!.sku, name: productDefs[1]!.name, category_id: categories[0]!.id, cost_price: productDefs[1]!.cost, selling_price: productDefs[1]!.price, reorder_point: productDefs[1]!.reorderPoint, tax_rate: 18 },
    { org_id: businessId, sku: productDefs[2]!.sku, name: productDefs[2]!.name, category_id: categories[0]!.id, cost_price: productDefs[2]!.cost, selling_price: productDefs[2]!.price, reorder_point: productDefs[2]!.reorderPoint, tax_rate: 18 },
    { org_id: businessId, sku: productDefs[3]!.sku, name: productDefs[3]!.name, category_id: categories[1]!.id, cost_price: productDefs[3]!.cost, selling_price: productDefs[3]!.price, reorder_point: productDefs[3]!.reorderPoint, tax_rate: 12 },
    { org_id: businessId, sku: productDefs[4]!.sku, name: productDefs[4]!.name, category_id: categories[1]!.id, cost_price: productDefs[4]!.cost, selling_price: productDefs[4]!.price, reorder_point: productDefs[4]!.reorderPoint, tax_rate: 12 },
    { org_id: businessId, sku: productDefs[5]!.sku, name: productDefs[5]!.name, category_id: categories[1]!.id, cost_price: productDefs[5]!.cost, selling_price: productDefs[5]!.price, reorder_point: productDefs[5]!.reorderPoint, tax_rate: 12 },
  ]);

  // --- Opening stock (inbound movements -- apply_stock_movement()/check_stock_alerts()
  // run as real triggers, so stock_levels and any resulting low-stock alerts are
  // produced by the database itself, not hand-inserted). Not tracked separately -- both
  // tables cascade away when their core.items row is deleted. ---
  const stockMovements = products.map((p, i) => ({
    business_id: businessId,
    item_id: p.id,
    warehouse_id: mainWarehouse.id,
    type: "inbound" as const,
    quantity: productDefs[i]!.stock,
    notes: "Opening stock (demo data)",
    created_by: targetUserId,
  }));
  const { error: movementsError } = await inventory.from("stock_movements").insert(stockMovements);
  if (movementsError) throw new Error(`insert stock_movements failed: ${movementsError.message}`);

  // --- One pending purchase order (sent, unreceived -- shows up as "pending
  // purchases"/"incoming stock" on the dashboard) ---
  const poGst = computeLineGst({
    taxableValue: productDefs[0]!.cost * 20,
    gstRatePercent: 18,
    sellerStateCode: stateCode,
    buyerStateCode: stateCode,
  });
  const poSubtotal = roundCurrency(productDefs[0]!.cost * 20);
  const [purchaseOrder] = await insertTracked<{ id: string }>("core", "purchase_orders", inventory, [
    {
      org_id: businessId,
      supplier_id: suppliers[0]!.id,
      warehouse_id: mainWarehouse.id,
      po_number: `PO-DEMO-${tag}`,
      status: "sent",
      subtotal: poSubtotal,
      cgst_amount: poGst.cgstAmount,
      sgst_amount: poGst.sgstAmount,
      igst_amount: poGst.igstAmount,
      total_amount: roundCurrency(poSubtotal + poGst.totalTax),
      created_by: targetUserId,
    },
  ]);
  const { error: poItemError } = await inventory.from("purchase_order_items").insert({
    org_id: businessId,
    purchase_order_id: purchaseOrder!.id,
    product_id: products[0]!.id,
    quantity: 20,
    unit_cost: productDefs[0]!.cost,
    tax_rate: 18,
    cgst_amount: poGst.cgstAmount,
    sgst_amount: poGst.sgstAmount,
    igst_amount: poGst.igstAmount,
  });
  if (poItemError) throw new Error(`insert purchase_order_items failed: ${poItemError.message}`);

  // --- One draft sales order (shows up in the Sales Orders list) ---
  const soGst = computeLineGst({
    taxableValue: productDefs[2]!.price * 3,
    gstRatePercent: 18,
    sellerStateCode: stateCode,
    buyerStateCode: stateCode,
  });
  const soSubtotal = roundCurrency(productDefs[2]!.price * 3);
  const [salesOrder] = await insertTracked<{ id: string }>("core", "sales_orders", inventory, [
    {
      org_id: businessId,
      customer_id: customers[0]!.id,
      warehouse_id: mainWarehouse.id,
      // Explicit, never left to inventory.next_sales_order_number()'s own auto-numbering
      // fallback -- that RPC calls core.next_number(), which checks core.user_business_ids()
      // (resolved via auth.uid()) and throws "Not a member of this business" under a
      // service-role client with no session. Postgres's COALESCE short-circuits once the
      // first argument is non-null, so supplying so_number here skips that call entirely.
      so_number: `SO-DEMO-${tag}`,
      status: "draft",
      subtotal: soSubtotal,
      cgst_amount: soGst.cgstAmount,
      sgst_amount: soGst.sgstAmount,
      igst_amount: soGst.igstAmount,
      total_amount: roundCurrency(soSubtotal + soGst.totalTax),
      created_by: targetUserId,
    },
  ]);
  const { error: soItemError } = await inventory.from("sales_order_items").insert({
    org_id: businessId,
    sales_order_id: salesOrder!.id,
    product_id: products[2]!.id,
    quantity: 3,
    unit_price: productDefs[2]!.price,
    tax_rate: 18,
    cgst_amount: soGst.cgstAmount,
    sgst_amount: soGst.sgstAmount,
    igst_amount: soGst.igstAmount,
  });
  if (soItemError) throw new Error(`insert sales_order_items failed: ${soItemError.message}`);

  await finalizeSeedBatch(batchId, recordCount);
  return { recordCount, businessName: business.name };
}

export async function deleteDemoData(
  businessId: string,
): Promise<{ deletedBatches: number; deletedRecords: number }> {
  return deleteAllSeedDataForBusiness(businessId);
}
