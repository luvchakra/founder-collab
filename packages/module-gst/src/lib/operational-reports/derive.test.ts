import { describe, expect, it } from "vitest";
import { grossMargin, splitSalesByItem, summarisePurchases, valueInventory } from "./derive";
import { profitAndLoss } from "../accounting/reports";

// FIN-6 — operational reports. (The negative-stock cases double as FIN-11's negative
// inventory edge case.)

describe("splitSalesByItem", () => {
  it("puts goods and parts under products, services and labour under services", () => {
    const split = splitSalesByItem([
      { itemId: "g", itemName: "Widget", itemKind: "good", sku: "W1", quantity: 2, salesValue: 200 },
      { itemId: "p", itemName: "Filter", itemKind: "part", sku: null, quantity: 1, salesValue: 50 },
      { itemId: "s", itemName: "Install", itemKind: "service", sku: null, quantity: 1, salesValue: 500 },
      { itemId: "l", itemName: "Labour hour", itemKind: "labour", sku: null, quantity: 3, salesValue: 300 },
      { itemId: "e", itemName: "Travel recharge", itemKind: "expense", sku: null, quantity: 1, salesValue: 40 },
      { itemId: null, itemName: null, itemKind: null, sku: null, quantity: null, salesValue: 1000 },
    ]);
    expect(split.products.map((r) => r.itemId)).toEqual(["g", "p"]);
    expect(split.services.map((r) => r.itemId)).toEqual(["s", "l"]);
    expect(split.other.map((r) => r.itemId)).toEqual(["e"]);
    expect(split.totalProducts).toBe(250);
    expect(split.totalServices).toBe(800);
    expect(split.unitemised).toBe(1000);
  });
});

describe("summarisePurchases", () => {
  it("keeps bills and expenses apart and totals each", () => {
    const summary = summarisePurchases([
      { partyId: "a", partyName: "A", kind: "bill", documentCount: 2, taxableValue: 1000, tax: 180, total: 1180 },
      { partyId: "b", partyName: "B", kind: "bill", documentCount: 1, taxableValue: 500.1, tax: 90.02, total: 590.12 },
      { partyId: "c", partyName: "Landlord", kind: "expense", documentCount: 1, taxableValue: 20000, tax: 0, total: 20000 },
    ]);
    expect(summary.bills).toHaveLength(2);
    expect(summary.totalBills).toEqual({ taxable: 1500.1, tax: 270.02, total: 1770.12 });
    expect(summary.totalExpenses).toEqual({ taxable: 20000, tax: 0, total: 20000 });
  });
});

describe("valueInventory", () => {
  it("values stock at quantity x unit cost, largest first", () => {
    const v = valueInventory([
      { itemId: "a", name: "A", sku: null, quantity: 10, unitCost: 5 },
      { itemId: "b", name: "B", sku: null, quantity: 2, unitCost: 100 },
    ]);
    expect(v.rows.map((r) => [r.itemId, r.value])).toEqual([["b", 200], ["a", 50]]);
    expect(v.totalValue).toBe(250);
  });

  it("never nets oversold (negative) stock against real stock — it is flagged beside the total", () => {
    const v = valueInventory([
      { itemId: "a", name: "A", sku: null, quantity: 10, unitCost: 5 },
      { itemId: "n", name: "Oversold", sku: null, quantity: -3, unitCost: 20 },
    ]);
    expect(v.totalValue).toBe(50);
    expect(v.negativeCount).toBe(1);
    expect(v.negativeValue).toBe(60);
    expect(v.rows.find((r) => r.itemId === "n")).toMatchObject({ negative: true, value: 0 });
  });

  it("drops items with nothing on hand and counts uncosted stock", () => {
    const v = valueInventory([
      { itemId: "z", name: "Zero", sku: null, quantity: 0, unitCost: 5 },
      { itemId: "u", name: "Uncosted", sku: null, quantity: 4, unitCost: 0 },
    ]);
    expect(v.rows.map((r) => r.itemId)).toEqual(["u"]);
    expect(v.uncostedCount).toBe(1);
    expect(v.totalValue).toBe(0);
  });
});

describe("grossMargin", () => {
  const acc = (accountNumber: string, type: "income" | "cogs", debit: number, credit: number) => ({
    accountId: accountNumber,
    accountNumber,
    name: accountNumber,
    type,
    debit,
    credit,
  });

  it("reads revenue, COGS and gross profit from the profit and loss", () => {
    const margin = grossMargin(profitAndLoss([acc("4100", "income", 0, 10000), acc("5100", "cogs", 6000, 0)]));
    expect(margin).toEqual({ revenue: 10000, cogs: 6000, grossProfit: 4000, marginPercent: 40 });
  });

  it("has no margin percentage without revenue", () => {
    expect(grossMargin(profitAndLoss([acc("5100", "cogs", 100, 0)])).marginPercent).toBeNull();
  });
});
