import { createClient } from "../../db/server";
import { getBusinessGstProfile } from "../tenancy/queries";
import { isValidGstin } from "@cofounderai/core/lib/gst";
import type { DashboardSummary } from "./types";

const OPEN_PO_STATUSES = new Set(["draft", "pending_approval", "approved", "sent", "partially_received"]);

// A PO's outstanding (ordered - received) quantity counts as "incoming" once it's a
// confirmed order the supplier is acting on, not while it's still a draft or awaiting
// approval -- matches stockpilot-ai-ops's own INCOMING_PO_STATUSES exactly.
const INCOMING_PO_STATUSES = new Set(["approved", "sent", "partially_received"]);

// Mirrors the sign convention inventory.apply_stock_movement() uses to keep
// stock_levels in sync, so "increase" here means the same thing it means to the ledger.
const INCREASE_TYPES = new Set(["inbound", "transfer_in", "return", "adjustment"]);

const MOVEMENT_DAYS = 14;

function last14DayKeys(): string[] {
  const days: string[] = [];
  for (let i = MOVEMENT_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Ported from stockpilot-ai-ops's routes/_authenticated/dashboard.tsx `summary`
 * useQuery, computed server-side in one Server Component fetch instead of client-side
 * react-query. `canViewCost` masks stockValue to null the same way products/queries.ts's
 * listProducts already masks cost_price -- there's no `products_safe` column-masking
 * view in this platform's compat layer (SP-4 built row-level compat views, not a
 * column-level one), so the masking has to happen wherever cost_price is read.
 */
export async function getDashboardSummary(businessId: string, canViewCost: boolean): Promise<DashboardSummary> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const today = now.toISOString().slice(0, 10);
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (MOVEMENT_DAYS - 1));
  windowStart.setHours(0, 0, 0, 0);

  const [
    productsRes,
    levelsRes,
    alertsRes,
    movementsRes,
    purchaseOrdersRes,
    gstPurchasesRes,
    openPoItemsRes,
    salesTodayRes,
    gstSalesRes,
    inTransitRes,
    gstProfile,
  ] = await Promise.all([
    supabase.from("products").select("id, name, sku, cost_price, reorder_point").eq("org_id", businessId),
    supabase.from("stock_levels").select("item_id, quantity, reserved, damaged, expired").eq("business_id", businessId),
    supabase
      .from("alerts")
      .select("id, title, severity, created_at")
      .eq("business_id", businessId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("stock_movements")
      .select("type, quantity, created_at")
      .eq("business_id", businessId)
      .gte("created_at", windowStart.toISOString()),
    supabase
      .from("purchase_orders")
      .select("id, po_number, status, expected_delivery_date, supplier_name")
      .eq("org_id", businessId),
    supabase
      .from("purchase_orders")
      .select("id, cgst_amount, sgst_amount, igst_amount, supplier_id")
      .eq("org_id", businessId)
      .gte("order_date", monthStart),
    supabase
      .from("purchase_order_items")
      .select("quantity, received_quantity, purchase_order_id")
      .eq("org_id", businessId),
    supabase.from("sales_orders").select("total_amount, status").eq("org_id", businessId).eq("order_date", today),
    supabase
      .from("sales_invoices")
      .select("cgst_amount, sgst_amount, igst_amount")
      .eq("org_id", businessId)
      .gte("invoice_date", monthStart),
    supabase
      .from("stock_transfers")
      .select("id, transfer_number, source_warehouse_name, destination_warehouse_name")
      .eq("business_id", businessId)
      .eq("status", "in_transit"),
    getBusinessGstProfile(businessId),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (levelsRes.error) throw levelsRes.error;
  if (alertsRes.error) throw alertsRes.error;
  if (movementsRes.error) throw movementsRes.error;
  if (purchaseOrdersRes.error) throw purchaseOrdersRes.error;
  if (gstPurchasesRes.error) throw gstPurchasesRes.error;
  if (openPoItemsRes.error) throw openPoItemsRes.error;
  if (salesTodayRes.error) throw salesTodayRes.error;
  if (gstSalesRes.error) throw gstSalesRes.error;
  if (inTransitRes.error) throw inTransitRes.error;

  const productList = productsRes.data;
  const qtyByProduct = new Map<string, number>();
  let reservedTotal = 0;
  let damagedTotal = 0;
  let expiredTotal = 0;
  for (const l of levelsRes.data) {
    qtyByProduct.set(l.item_id, (qtyByProduct.get(l.item_id) ?? 0) + Number(l.quantity));
    reservedTotal += Number(l.reserved);
    damagedTotal += Number(l.damaged);
    expiredTotal += Number(l.expired);
  }
  const unitsOnHand = [...qtyByProduct.values()].reduce((a, b) => a + b, 0);

  // Resolve each open PO item's status via the purchase order it belongs to, same
  // two-step shape as stockpilot-ai-ops's own embed (this codebase's compat views carry
  // no PostgREST-embeddable FKs -- see products/queries.ts's own precedent).
  const poStatusById = new Map(purchaseOrdersRes.data.map((po) => [po.id, po.status]));
  const incomingTotal = openPoItemsRes.data.reduce((sum, item) => {
    const status = poStatusById.get(item.purchase_order_id);
    if (!status || !INCOMING_PO_STATUSES.has(status)) return sum;
    const outstanding = Number(item.quantity) - Number(item.received_quantity);
    return outstanding > 0 ? sum + outstanding : sum;
  }, 0);

  const stockValue = canViewCost
    ? productList.reduce((sum, p) => sum + Number(p.cost_price) * (qtyByProduct.get(p.id) ?? 0), 0)
    : null;

  let healthy = 0;
  let low = 0;
  let stockout = 0;
  const lowStock: { id: string; name: string; sku: string | null; reorder_point: number }[] = [];
  for (const p of productList) {
    const qty = qtyByProduct.get(p.id) ?? 0;
    if (qty <= 0) {
      stockout++;
      lowStock.push(p);
    } else if (Number(p.reorder_point) > 0 && qty <= Number(p.reorder_point)) {
      low++;
      lowStock.push(p);
    } else {
      healthy++;
    }
  }

  const openPOs = purchaseOrdersRes.data.filter((po) => OPEN_PO_STATUSES.has(po.status));
  const overduePOs = openPOs.filter((po) => po.expected_delivery_date && po.expected_delivery_date < today);

  const salesTodayTotal = salesTodayRes.data
    .filter((so) => so.status !== "draft" && so.status !== "cancelled")
    .reduce((sum, so) => sum + Number(so.total_amount), 0);

  const supplierIds = [...new Set(gstPurchasesRes.data.map((po) => po.supplier_id))];
  const suppliersRes = supplierIds.length
    ? await supabase.from("suppliers").select("id, gst_number").in("id", supplierIds)
    : { data: [] as { id: string; gst_number: string | null }[], error: null };
  if (suppliersRes.error) throw suppliersRes.error;
  const gstinBySupplierId = new Map(suppliersRes.data.map((s) => [s.id, s.gst_number]));
  const gstRiskCount = gstPurchasesRes.data.filter(
    (po) => !isValidGstin(gstinBySupplierId.get(po.supplier_id)),
  ).length;

  const cgstThisMonth = gstPurchasesRes.data.reduce((s, po) => s + Number(po.cgst_amount), 0);
  const sgstThisMonth = gstPurchasesRes.data.reduce((s, po) => s + Number(po.sgst_amount), 0);
  const igstThisMonth = gstPurchasesRes.data.reduce((s, po) => s + Number(po.igst_amount), 0);
  const gstPayableThisMonth = cgstThisMonth + sgstThisMonth + igstThisMonth;

  const cgstCollectedThisMonth = gstSalesRes.data.reduce((s, inv) => s + Number(inv.cgst_amount), 0);
  const sgstCollectedThisMonth = gstSalesRes.data.reduce((s, inv) => s + Number(inv.sgst_amount), 0);
  const igstCollectedThisMonth = gstSalesRes.data.reduce((s, inv) => s + Number(inv.igst_amount), 0);
  const gstCollectedThisMonth = cgstCollectedThisMonth + sgstCollectedThisMonth + igstCollectedThisMonth;

  const byDay = new Map(last14DayKeys().map((day) => [day, { increase: 0, decrease: 0 }]));
  for (const m of movementsRes.data) {
    const day = m.created_at.slice(0, 10);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    if (INCREASE_TYPES.has(m.type)) bucket.increase += Number(m.quantity);
    else bucket.decrease += Number(m.quantity);
  }
  const movementTrend = [...byDay.entries()].map(([day, v]) => ({
    day,
    label: new Date(day).getDate(),
    ...v,
  }));

  return {
    productCount: productList.length,
    stockValue,
    units: unitsOnHand,
    reserved: reservedTotal,
    incoming: incomingTotal,
    available: unitsOnHand - reservedTotal - damagedTotal - expiredTotal,
    healthy,
    low,
    stockout,
    lowStock,
    pendingPurchases: openPOs.length,
    overduePOs,
    inTransitTransfers: inTransitRes.data,
    alerts: alertsRes.data,
    movementTrend,
    gstRiskCount,
    cgstThisMonth,
    sgstThisMonth,
    igstThisMonth,
    gstPayableThisMonth,
    cgstCollectedThisMonth,
    sgstCollectedThisMonth,
    igstCollectedThisMonth,
    gstCollectedThisMonth,
    salesTodayTotal,
    hasGstin: Boolean(gstProfile.gstin),
  };
}
