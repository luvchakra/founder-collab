import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-INV-01..12 -- the export-only reads: the pages' predicates, the business's own
// tenant column on every table, and paging past PostgREST's 1,000-row cap.

type Row = Record<string, unknown>;
type Call = { table: string; method: string; args: unknown[] };

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, calls: [] as Call[] }));

function fakeClient() {
  return {
    from(table: string) {
      let rows = [...(state.tables[table] ?? [])];
      const record = (method: string, args: unknown[]) => state.calls.push({ table, method, args });
      const builder = {
        select: (...args: unknown[]) => (record("select", args), builder),
        eq: (column: string, value: unknown) => {
          record("eq", [column, value]);
          rows = rows.filter((r) => r[column] === value);
          return builder;
        },
        gte: (...args: unknown[]) => (record("gte", args), builder),
        lte: (...args: unknown[]) => (record("lte", args), builder),
        order: (...args: unknown[]) => (record("order", args), builder),
        range: async (from: number, to: number) => (record("range", [from, to]), { data: rows.slice(from, to + 1), error: null }),
      };
      return builder;
    },
  };
}

vi.mock("../db/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => fakeClient() }));

import {
  listAlertsForExport,
  listAuditLogForExport,
  listProductsForExport,
  listPurchaseOrdersForExport,
  listStockLevelsForExport,
} from "./queries";

const BIZ = "biz-1";

beforeEach(() => {
  state.tables = {};
  state.calls = [];
});

const callsFor = (table: string, method: string) => state.calls.filter((c) => c.table === table && c.method === method).map((c) => c.args);

describe("Inventory export queries (EXP-INV-01..12)", () => {
  it("listProductsForExport pages past 1,000 rows on org_id and masks cost without permission (EXP-INV-02)", async () => {
    state.tables.products = [
      ...Array.from({ length: 1001 }, (_, i) => ({ id: `p${i}`, org_id: BIZ, cost_price: 10 })),
      { id: "foreign", org_id: "biz-other", cost_price: 99 },
    ];
    const masked = await listProductsForExport(BIZ, false);
    expect(masked).toHaveLength(1001);
    expect(masked.every((p) => p.cost_price === null)).toBe(true);
    expect(callsFor("products", "eq")[0]).toEqual(["org_id", BIZ]);
    expect(callsFor("products", "range")).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(callsFor("products", "order").at(-1)).toEqual(["id", { ascending: true }]);

    const visible = await listProductsForExport(BIZ, true);
    expect(visible[0]!.cost_price).toBe(10);
  });

  it("listStockLevelsForExport joins names and incoming from confirmed POs, on business_id (EXP-INV-06)", async () => {
    state.tables.stock_levels = [{ id: "sl1", business_id: BIZ, item_id: "p1", warehouse_id: "w1", quantity: 3 }];
    state.tables.products = [{ id: "p1", org_id: BIZ, name: "Drill", sku: "D", reorder_point: 5 }];
    state.tables.warehouses = [{ id: "w1", business_id: BIZ, name: "Main" }];
    state.tables.purchase_orders = [
      { id: "po1", org_id: BIZ, status: "sent", warehouse_id: "w1" },
      { id: "po2", org_id: BIZ, status: "draft", warehouse_id: "w1" },
    ];
    state.tables.purchase_order_items = [
      { id: "i1", org_id: BIZ, purchase_order_id: "po1", product_id: "p1", quantity: 10, received_quantity: 4 },
      { id: "i2", org_id: BIZ, purchase_order_id: "po2", product_id: "p1", quantity: 50, received_quantity: 0 },
    ];
    const [level] = await listStockLevelsForExport(BIZ);
    expect(level).toMatchObject({ item_name: "Drill", item_sku: "D", reorder_point: 5, warehouse_name: "Main", incoming: 6 });
    expect(callsFor("stock_levels", "eq")[0]).toEqual(["business_id", BIZ]);
    expect(callsFor("warehouses", "eq")[0]).toEqual(["business_id", BIZ]);
    expect(callsFor("purchase_orders", "eq")[0]).toEqual(["org_id", BIZ]);
  });

  it("listPurchaseOrdersForExport names suppliers, warehouses and line products (EXP-INV-07)", async () => {
    state.tables.purchase_orders = [{ id: "po1", org_id: BIZ, supplier_id: "s1", warehouse_id: "w1" }];
    state.tables.purchase_order_items = [{ id: "l1", org_id: BIZ, purchase_order_id: "po1", product_id: "p1" }];
    state.tables.suppliers = [{ id: "s1", org_id: BIZ, name: "Bosch" }];
    state.tables.warehouses = [{ id: "w1", business_id: BIZ, name: "Main" }];
    state.tables.products = [{ id: "p1", org_id: BIZ, name: "Drill", sku: "D" }];
    const { orders, lines } = await listPurchaseOrdersForExport(BIZ);
    expect(orders[0]).toMatchObject({ supplier_name: "Bosch", warehouse_name: "Main" });
    expect(lines[0]).toMatchObject({ item_name: "Drill", item_sku: "D" });
  });

  it("listAlertsForExport resolves a stock-level alert's product and warehouse (EXP-INV-11)", async () => {
    state.tables.alerts = [
      { id: "a1", business_id: BIZ, entity_type: "stock_level", entity_id: "sl1" },
      { id: "a2", business_id: BIZ, entity_type: null, entity_id: null },
    ];
    state.tables.stock_levels = [{ id: "sl1", business_id: BIZ, item_id: "p1", warehouse_id: "w1" }];
    state.tables.products = [{ id: "p1", org_id: BIZ, name: "Drill", sku: null }];
    state.tables.warehouses = [{ id: "w1", business_id: BIZ, name: "Main" }];
    const [first, second] = await listAlertsForExport(BIZ);
    expect(first).toMatchObject({ product_name: "Drill", warehouse_name: "Main" });
    expect(second).toMatchObject({ product_name: null, warehouse_name: null });
  });

  it("listAuditLogForExport applies the page's filters without its 200 cap (EXP-INV-12)", async () => {
    state.tables.audit_log = Array.from({ length: 1200 }, (_, i) => ({ id: `e${i}`, business_id: BIZ, entity_type: "document", actor_id: "u1" }));
    const rows = await listAuditLogForExport(BIZ, { entityType: "document", actorId: "u1", dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(rows).toHaveLength(1200);
    const eq = callsFor("audit_log", "eq");
    expect(eq).toContainEqual(["business_id", BIZ]);
    expect(eq).toContainEqual(["entity_type", "document"]);
    expect(eq).toContainEqual(["actor_id", "u1"]);
    expect(callsFor("audit_log", "gte")).toContainEqual(["created_at", "2026-09-01T00:00:00"]);
    expect(callsFor("audit_log", "lte")).toContainEqual(["created_at", "2026-09-30T23:59:59.999"]);
  });
});
