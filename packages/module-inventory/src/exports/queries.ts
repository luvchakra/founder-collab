import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { fetchAllRows } from "@cofounderai/core/exports/fetch-all";
import type { AuditLogEntry } from "@cofounderai/core/audit/types";
import { createClient } from "../db/server";
import type { Alert } from "../lib/alerts/types";
import type { Customer } from "../lib/customers/types";
import type { Product } from "../lib/products/types";
import type { PurchaseOrder, PurchaseOrderItem } from "../lib/purchase-orders/types";
import type { SalesInvoice } from "../lib/sales-invoices/types";
import type { SalesOrder, SalesOrderItem } from "../lib/sales-orders/types";
import type { SalesReturn, SalesReturnItem } from "../lib/sales-returns/types";
import type { StockLevel } from "../lib/stock/types";
import type { StockTransfer, StockTransferItem } from "../lib/stock-transfers/types";
import type { Supplier } from "../lib/suppliers/types";

/**
 * EXP-INV-01..12 -- export-only reads (§36, rule 1 of docs/design/data-exports.md).
 *
 * Every Inventory list page's loader is an unbounded `select()` (and the audit log is
 * capped at 200), so a large catalogue or order book is silently cut at PostgREST's
 * 1,000-row limit. These apply the page loaders' own predicates -- the business's
 * `org_id` on the compatibility views, `business_id` on inventory's own tables -- page
 * through with `fetchAllRows` in a stable order ending in `id`, and join names in JS
 * exactly as the loaders do. The tenant is always the `businessId` the export route
 * resolved from the session.
 */

type Tenant = "org_id" | "business_id";

async function allRows<T>(
  table: string,
  tenant: Tenant,
  businessId: string,
  options: { columns?: string; orderBy?: string; ascending?: boolean } = {},
): Promise<T[]> {
  const supabase = await createClient();
  const { columns = "*", orderBy = "created_at", ascending = false } = options;
  return fetchAllRows<T>(
    (from, to) =>
      // A column list held in a variable defeats supabase-js's select-string parser, so
      // the row type is asserted here instead of inferred.
      supabase
        .from(table)
        .select(columns)
        .eq(tenant, businessId)
        .order(orderBy, { ascending })
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>,
  );
}

async function namesById(table: string, tenant: Tenant, businessId: string): Promise<Map<string, string>> {
  const rows = await allRows<{ id: string; name: string }>(table, tenant, businessId, { columns: "id, name", orderBy: "name", ascending: true });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** EXP-INV-02: `listProducts()`, every row. Cost is nulled here too when the caller may
 * not see it (the adapter also drops the column) -- the same server-side masking the
 * page's loader applies. */
export async function listProductsForExport(businessId: string, canViewCost: boolean): Promise<Product[]> {
  const products = await allRows<Product>("products", "org_id", businessId);
  return canViewCost ? products : products.map((p) => ({ ...p, cost_price: null }));
}

/** Category / supplier / warehouse / customer names, every row (the pages' own lookups
 * without the 1,000-row cap). */
export const listCategoryNamesForExport = (businessId: string) => namesById("categories", "org_id", businessId);
export const listCustomerNamesForExport = (businessId: string) => namesById("customers", "org_id", businessId);
export const listSupplierNamesForExport = (businessId: string) => namesById("suppliers", "org_id", businessId);
export const listWarehouseNamesForExport = (businessId: string) => namesById("warehouses", "business_id", businessId);

/** The Products page shows supplier names for *active* suppliers only
 * (`listActiveSupplierOptions`); the export does the same. */
export async function listActiveSupplierNamesForExport(businessId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const rows = await fetchAllRows<{ id: string; name: string }>((from, to) =>
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("org_id", businessId)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** EXP-INV-03 */
export const listCustomersForExport = (businessId: string) => allRows<Customer>("customers", "org_id", businessId);
/** EXP-INV-04 */
export const listSuppliersForExport = (businessId: string) => allRows<Supplier>("suppliers", "org_id", businessId);

const INCOMING_PO_STATUSES = new Set(["approved", "sent", "partially_received"]);

/** EXP-INV-06: `listStockLevels()` -- the same joins (product, warehouse, incoming from
 * confirmed purchase orders) over every row of each table. */
export async function listStockLevelsForExport(businessId: string): Promise<StockLevel[]> {
  type Level = Omit<StockLevel, "item_name" | "item_sku" | "reorder_point" | "warehouse_name" | "incoming">;
  const [levels, items, warehouses, poItems, pos] = await Promise.all([
    allRows<Level>("stock_levels", "business_id", businessId, { orderBy: "updated_at" }),
    allRows<{ id: string; name: string; sku: string | null; reorder_point: number }>("products", "org_id", businessId, {
      columns: "id, name, sku, reorder_point",
    }),
    listWarehouseNamesForExport(businessId),
    allRows<{ id: string; purchase_order_id: string; product_id: string; quantity: number; received_quantity: number }>(
      "purchase_order_items",
      "org_id",
      businessId,
      { columns: "id, purchase_order_id, product_id, quantity, received_quantity" },
    ),
    allRows<{ id: string; status: string; warehouse_id: string }>("purchase_orders", "org_id", businessId, { columns: "id, status, warehouse_id" }),
  ]);

  const poById = new Map(pos.map((po) => [po.id, po]));
  const incomingByKey = new Map<string, number>();
  for (const item of poItems) {
    const po = poById.get(item.purchase_order_id);
    if (!po || !INCOMING_PO_STATUSES.has(po.status)) continue;
    const outstanding = Number(item.quantity) - Number(item.received_quantity);
    if (outstanding <= 0) continue;
    const key = `${item.product_id}:${po.warehouse_id}`;
    incomingByKey.set(key, (incomingByKey.get(key) ?? 0) + outstanding);
  }
  const itemById = new Map(items.map((i) => [i.id, i]));

  return levels.map((level) => {
    const item = itemById.get(level.item_id);
    return {
      ...level,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? null,
      reorder_point: item?.reorder_point ?? 0,
      warehouse_name: warehouses.get(level.warehouse_id) ?? "Unknown warehouse",
      incoming: incomingByKey.get(`${level.item_id}:${level.warehouse_id}`) ?? 0,
    };
  });
}

/** EXP-INV-07: `listPurchaseOrders()` plus every line (for received/outstanding and the
 * optional lines sheet). */
export async function listPurchaseOrdersForExport(businessId: string): Promise<{ orders: PurchaseOrder[]; lines: PurchaseOrderItem[] }> {
  const [orders, lines, suppliers, warehouses, products] = await Promise.all([
    allRows<Omit<PurchaseOrder, "supplier_name" | "warehouse_name">>("purchase_orders", "org_id", businessId),
    allRows<Omit<PurchaseOrderItem, "item_name" | "item_sku">>("purchase_order_items", "org_id", businessId, { orderBy: "created_at", ascending: true }),
    listSupplierNamesForExport(businessId),
    listWarehouseNamesForExport(businessId),
    listProductLabelsForExport(businessId),
  ]);
  return {
    orders: orders.map((po) => ({
      ...po,
      supplier_name: suppliers.get(po.supplier_id) ?? "Unknown supplier",
      warehouse_name: warehouses.get(po.warehouse_id) ?? "Unknown warehouse",
    })),
    lines: lines.map((line) => ({
      ...line,
      item_name: products.get(line.product_id)?.name ?? "Unknown item",
      item_sku: products.get(line.product_id)?.sku ?? null,
    })),
  };
}

async function listProductLabelsForExport(businessId: string): Promise<Map<string, { name: string; sku: string | null }>> {
  const rows = await allRows<{ id: string; name: string; sku: string | null }>("products", "org_id", businessId, { columns: "id, name, sku" });
  return new Map(rows.map((r) => [r.id, { name: r.name, sku: r.sku }]));
}

export type SalesReturnLine = Omit<SalesReturnItem, "item_name" | "item_sku">;
export type StockTransferLine = Omit<StockTransferItem, "item_name" | "item_sku">;

export type InvoiceSummary = Pick<SalesInvoice, "id" | "sales_order_id" | "invoice_number" | "payment_status">;

/** EXP-INV-08: `listSalesOrders()` plus every line, and each order's invoice (for its
 * payment status). */
export async function listSalesOrdersForExport(
  businessId: string,
): Promise<{ orders: SalesOrder[]; lines: SalesOrderItem[]; invoices: InvoiceSummary[] }> {
  const [orders, lines, invoices, customers, warehouses, products] = await Promise.all([
    allRows<Omit<SalesOrder, "customer_name" | "warehouse_name">>("sales_orders", "org_id", businessId),
    allRows<Omit<SalesOrderItem, "item_name" | "item_sku">>("sales_order_items", "org_id", businessId, { orderBy: "created_at", ascending: true }),
    allRows<InvoiceSummary>("sales_invoices", "org_id", businessId, { columns: "id, sales_order_id, invoice_number, payment_status" }),
    listCustomerNamesForExport(businessId),
    listWarehouseNamesForExport(businessId),
    listProductLabelsForExport(businessId),
  ]);
  return {
    orders: orders.map((so) => ({
      ...so,
      customer_name: customers.get(so.customer_id) ?? "Unknown customer",
      warehouse_name: warehouses.get(so.warehouse_id) ?? "Unknown warehouse",
    })),
    lines: lines.map((line) => ({
      ...line,
      item_name: products.get(line.product_id)?.name ?? "Unknown item",
      item_sku: products.get(line.product_id)?.sku ?? null,
    })),
    invoices,
  };
}

/** EXP-INV-09: `listSalesInvoices()`, every row. */
export async function listSalesInvoicesForExport(businessId: string): Promise<SalesInvoice[]> {
  const [invoices, customers, orders] = await Promise.all([
    allRows<Omit<SalesInvoice, "customer_name" | "so_number">>("sales_invoices", "org_id", businessId),
    listCustomerNamesForExport(businessId),
    allRows<{ id: string; so_number: string }>("sales_orders", "org_id", businessId, { columns: "id, so_number" }),
  ]);
  const soNumberById = new Map(orders.map((so) => [so.id, so.so_number]));
  return invoices.map((inv) => ({
    ...inv,
    customer_name: customers.get(inv.customer_id) ?? "Unknown customer",
    so_number: soNumberById.get(inv.sales_order_id) ?? "Unknown order",
  }));
}

/** EXP-INV-09: `listSalesReturns()`, every row, plus every return line (reasons and
 * value live on the lines). */
export async function listSalesReturnsForExport(businessId: string): Promise<{ returns: SalesReturn[]; lines: SalesReturnLine[] }> {
  const [returns, lines, orders, customers, creditNotes] = await Promise.all([
    allRows<Omit<SalesReturn, "so_number" | "customer_name" | "credit_note_number">>("sales_returns", "org_id", businessId),
    allRows<Omit<SalesReturnItem, "item_name" | "item_sku">>("sales_return_items", "org_id", businessId, { orderBy: "created_at", ascending: true }),
    allRows<{ id: string; so_number: string; customer_id: string }>("sales_orders", "org_id", businessId, { columns: "id, so_number, customer_id" }),
    listCustomerNamesForExport(businessId),
    allRows<{ id: string; credit_note_number: string }>("credit_notes", "org_id", businessId, { columns: "id, credit_note_number" }),
  ]);
  const soById = new Map(orders.map((so) => [so.id, so]));
  const creditNoteById = new Map(creditNotes.map((cn) => [cn.id, cn.credit_note_number]));
  return {
    returns: returns.map((r) => {
      const so = soById.get(r.sales_order_id);
      return {
        ...r,
        so_number: so?.so_number ?? "Unknown order",
        customer_name: so ? (customers.get(so.customer_id) ?? "Unknown customer") : "Unknown customer",
        credit_note_number: r.credit_note_id ? (creditNoteById.get(r.credit_note_id) ?? null) : null,
      };
    }),
    lines,
  };
}

/** EXP-INV-10: `listStockTransfers()`, every row, plus every transfer line (quantities). */
export async function listStockTransfersForExport(businessId: string): Promise<{ transfers: StockTransfer[]; lines: StockTransferLine[] }> {
  const [transfers, lines, warehouses] = await Promise.all([
    allRows<Omit<StockTransfer, "source_warehouse_name" | "destination_warehouse_name">>("stock_transfers", "business_id", businessId),
    allRows<Omit<StockTransferItem, "item_name" | "item_sku">>("stock_transfer_items", "business_id", businessId, { orderBy: "created_at", ascending: true }),
    listWarehouseNamesForExport(businessId),
  ]);
  return {
    transfers: transfers.map((t) => ({
      ...t,
      source_warehouse_name: warehouses.get(t.source_warehouse_id) ?? "Unknown warehouse",
      destination_warehouse_name: warehouses.get(t.destination_warehouse_id) ?? "Unknown warehouse",
    })),
    lines,
  };
}

export type AlertForExport = Alert & { product_name: string | null; warehouse_name: string | null };

/** EXP-INV-11: `listAlerts()`, every row, with the product and warehouse a stock-level
 * alert is about (alerts point at a `stock_level` row). */
export async function listAlertsForExport(businessId: string): Promise<AlertForExport[]> {
  const [alerts, levels, products, warehouses] = await Promise.all([
    allRows<Alert>("alerts", "business_id", businessId),
    allRows<{ id: string; item_id: string; warehouse_id: string }>("stock_levels", "business_id", businessId, { columns: "id, item_id, warehouse_id" }),
    listProductLabelsForExport(businessId),
    listWarehouseNamesForExport(businessId),
  ]);
  const levelById = new Map(levels.map((l) => [l.id, l]));
  return alerts.map((alert) => {
    const level = alert.entity_type === "stock_level" && alert.entity_id ? levelById.get(alert.entity_id) : undefined;
    return {
      ...alert,
      product_name: level ? (products.get(level.item_id)?.name ?? null) : null,
      warehouse_name: level ? (warehouses.get(level.warehouse_id) ?? null) : null,
    };
  });
}

export type AuditLogFilters = { entityType?: string; actorId?: string; dateFrom?: string; dateTo?: string };

/** EXP-INV-12: `listAuditLogForBusiness()`'s predicates without its 200-row cap. */
export async function listAuditLogForExport(businessId: string, filters: AuditLogFilters): Promise<AuditLogEntry[]> {
  const core = await createCoreClient({ schema: "core" });
  return fetchAllRows<AuditLogEntry>((from, to) => {
    let query = core.from("audit_log").select("*").eq("business_id", businessId);
    if (filters.entityType) query = query.eq("entity_type", filters.entityType);
    if (filters.actorId) query = query.eq("actor_id", filters.actorId);
    if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
    if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
    return query.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  });
}
