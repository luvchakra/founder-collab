import type { ProfitAndLoss } from "../accounting/reports";

/**
 * FIN-6 — operational reports (§28): sales by customer, product and service; purchase and
 * expense summaries; inventory valuation; cost of goods sold and gross margin.
 *
 * The figures come from three places, each the owner of its own facts: the documents
 * (`gst.sales_by_party`/`sales_by_item`/`purchases_by_party` over `core.documents`), the
 * ledger (COGS, gross margin and expenses by category — the same totals the profit and loss
 * reads), and Inventory's contract (stock positions at cost). This file is the arithmetic
 * on top, pure so it can be tested without any of them.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface SalesByPartyRow {
  partyId: string;
  partyName: string;
  documentCount: number;
  taxableValue: number;
  tax: number;
  total: number;
}

export interface SalesByItemRow {
  /** Null for the one "not itemised" row: header-only documents with no lines. */
  itemId: string | null;
  itemName: string | null;
  itemKind: string | null;
  sku: string | null;
  quantity: number | null;
  salesValue: number;
}

/** Item kinds that are goods sold versus work sold. `part` is stock; `labour` is work. An
 * `expense` item sold on is neither, and lands in "other" rather than being guessed. */
const PRODUCT_KINDS = new Set(["good", "part"]);
const SERVICE_KINDS = new Set(["service", "labour"]);

export interface SalesByItemSplit {
  products: SalesByItemRow[];
  services: SalesByItemRow[];
  other: SalesByItemRow[];
  /** Sales on documents with no lines, which cannot be attributed to an item. */
  unitemised: number;
  totalProducts: number;
  totalServices: number;
}

export function splitSalesByItem(rows: SalesByItemRow[]): SalesByItemSplit {
  const products = rows.filter((r) => r.itemId && PRODUCT_KINDS.has(r.itemKind ?? ""));
  const services = rows.filter((r) => r.itemId && SERVICE_KINDS.has(r.itemKind ?? ""));
  const other = rows.filter((r) => r.itemId && !PRODUCT_KINDS.has(r.itemKind ?? "") && !SERVICE_KINDS.has(r.itemKind ?? ""));
  const total = (list: SalesByItemRow[]) => round2(list.reduce((s, r) => s + r.salesValue, 0));
  return {
    products,
    services,
    other,
    unitemised: round2(rows.filter((r) => !r.itemId).reduce((s, r) => s + r.salesValue, 0)),
    totalProducts: total(products),
    totalServices: total(services),
  };
}

export interface PurchaseByPartyRow {
  partyId: string;
  partyName: string;
  kind: "bill" | "expense";
  documentCount: number;
  taxableValue: number;
  tax: number;
  total: number;
}

export interface PurchaseSummary {
  bills: PurchaseByPartyRow[];
  expenses: PurchaseByPartyRow[];
  totalBills: { taxable: number; tax: number; total: number };
  totalExpenses: { taxable: number; tax: number; total: number };
}

export function summarisePurchases(rows: PurchaseByPartyRow[]): PurchaseSummary {
  const totals = (list: PurchaseByPartyRow[]) => ({
    taxable: round2(list.reduce((s, r) => s + r.taxableValue, 0)),
    tax: round2(list.reduce((s, r) => s + r.tax, 0)),
    total: round2(list.reduce((s, r) => s + r.total, 0)),
  });
  const bills = rows.filter((r) => r.kind !== "expense");
  const expenses = rows.filter((r) => r.kind === "expense");
  return { bills, expenses, totalBills: totals(bills), totalExpenses: totals(expenses) };
}

export interface StockPosition {
  itemId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitCost: number;
}

export interface ValuedStockRow extends StockPosition {
  value: number;
  negative: boolean;
}

export interface InventoryValuation {
  rows: ValuedStockRow[];
  /** Stock on hand at cost. Negative positions contribute nothing: stock that has been
   * oversold is a shortfall to investigate, not a negative asset to net against real
   * stock — netting it would quietly understate what is actually on the shelves. */
  totalValue: number;
  negativeCount: number;
  /** The oversold positions at cost, reported beside the total rather than inside it. */
  negativeValue: number;
  /** Items held at zero cost: counted, but worth nothing until someone sets a cost. */
  uncostedCount: number;
}

export function valueInventory(positions: StockPosition[]): InventoryValuation {
  const rows = positions
    .filter((p) => p.quantity !== 0)
    .map((p) => {
      const negative = p.quantity < 0;
      return { ...p, negative, value: negative ? 0 : round2(p.quantity * p.unitCost) };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const negatives = rows.filter((r) => r.negative);
  return {
    rows,
    totalValue: round2(rows.reduce((s, r) => s + r.value, 0)),
    negativeCount: negatives.length,
    negativeValue: round2(negatives.reduce((s, r) => s + Math.abs(r.quantity) * r.unitCost, 0)),
    uncostedCount: rows.filter((r) => !r.negative && r.unitCost === 0).length,
  };
}

export interface GrossMargin {
  revenue: number;
  cogs: number;
  grossProfit: number;
  /** Gross profit as a share of revenue, to one decimal place; null with no revenue,
   * where a percentage would be a division by zero dressed as a figure. */
  marginPercent: number | null;
}

/** Gross margin from the profit and loss — the ledger's numbers, not a re-derivation from
 * documents that could disagree with them. */
export function grossMargin(pl: ProfitAndLoss): GrossMargin {
  return {
    revenue: pl.totalIncome,
    cogs: pl.totalCogs,
    grossProfit: pl.grossProfit,
    marginPercent: pl.totalIncome === 0 ? null : Math.round((pl.grossProfit / pl.totalIncome) * 1000) / 10,
  };
}
