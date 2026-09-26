import { describe, expect, it } from "vitest";
import { resolveDimensionSettings, summariseByDimension } from "./derive";

// FIN-9 — dimensions.

describe("resolveDimensionSettings", () => {
  it("defaults every dimension to off with its default name, stored rows winning", () => {
    const settings = resolveDimensionSettings([{ dimension_key: "location", enabled: true, label: "Branch" }]);
    expect(settings).toEqual([
      { key: "party", enabled: false, label: "Customer / supplier" },
      { key: "item", enabled: false, label: "Product / service" },
      { key: "location", enabled: true, label: "Branch" },
      { key: "project", enabled: false, label: "Project" },
    ]);
  });

  it("falls back to the default name for a blank label", () => {
    expect(resolveDimensionSettings([{ dimension_key: "project", enabled: true, label: "  " }])[3]!.label).toBe("Project");
  });
});

describe("summariseByDimension", () => {
  const names = new Map([["p1", "Acme"], ["p2", "Zenith"]]);

  it("reports income, costs and profit per value, counting only profit and loss accounts", () => {
    const rows = summariseByDimension(
      [
        { value: "p1", accountType: "income", debit: 0, credit: 1000 },
        { value: "p1", accountType: "cogs", debit: 600, credit: 0 },
        { value: "p1", accountType: "asset", debit: 1180, credit: 0 }, // the receivable: not P&L
        { value: "p2", accountType: "income", debit: 0, credit: 3000 },
        { value: "p2", accountType: "expense", debit: 200, credit: 0 },
      ],
      names,
    );
    expect(rows).toEqual([
      { value: "p2", name: "Zenith", income: 3000, costs: 200, profit: 2800 },
      { value: "p1", name: "Acme", income: 1000, costs: 600, profit: 400 },
    ]);
  });

  it("puts untagged lines under Unassigned, last, so the report adds up to the whole P&L", () => {
    const rows = summariseByDimension(
      [
        { value: null, accountType: "expense", debit: 5000, credit: 0 },
        { value: "Pune", accountType: "income", debit: 0, credit: 100 },
      ],
      new Map(),
    );
    expect(rows.map((r) => r.name)).toEqual(["Pune", "Unassigned"]);
    expect(rows[1]).toMatchObject({ income: 0, costs: 5000, profit: -5000 });
  });

  it("nets a reversal carried under the same value to nothing, and drops it", () => {
    const rows = summariseByDimension(
      [
        { value: "p1", accountType: "income", debit: 1000, credit: 1000 },
      ],
      names,
    );
    expect(rows).toEqual([]);
  });
});
