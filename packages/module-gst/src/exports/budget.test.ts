import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-10 -- Budget vs Actual export.

const q = vi.hoisted(() => ({ getActivationSettings: vi.fn(), getBudgetVsActual: vi.fn(), getLedgerCurrency: vi.fn() }));
vi.mock("../lib/activation/queries", () => ({ getActivationSettings: q.getActivationSettings }));
vi.mock("../lib/accounting/budget-queries", () => ({ getBudgetVsActual: q.getBudgetVsActual }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeBudgetExport } from "./budget";
import { TENANT, csvLines, headers, rowValues, runAdapter } from "./test-support";

const row = {
  accountId: "acc-rent",
  accountNumber: "6100",
  name: "Rent",
  type: "expense",
  budgeted: 0,
  actual: 25000,
  variance: 25000,
  direction: "adverse",
  percentOfBudget: null,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  q.getActivationSettings.mockReset().mockResolvedValue({ accountingMethod: "accrual", fiscalYearStartMonth: 4 });
  q.getBudgetVsActual.mockReset().mockResolvedValue({
    rows: [row, { ...row, accountId: "acc-sales", accountNumber: "4000", name: "Sales", type: "income", budgeted: 100000, actual: 90000, variance: -10000, percentOfBudget: -10 }],
    totalBudgeted: 100000,
    totalActual: 115000,
    budgetedProfit: 100000,
    actualProfit: 65000,
    profitVariance: -35000,
    profitDirection: "adverse",
    hasBudget: true,
  });
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});
afterEach(() => vi.useRealTimers());

describe("EXP-FIN-10 finance.budget", () => {
  it("is Finance-licensed with the page's (empty) read permission", () => {
    expect(financeBudgetExport.id).toBe("finance.budget");
    expect(financeBudgetExport.module).toBe("gst");
    expect(financeBudgetExport.permissions).toEqual([]);
  });

  it("uses the page's fixed range -- fiscal year to date for the business's fiscal year -- for the context tenant", async () => {
    const { workbook } = await runAdapter(financeBudgetExport, { from: "2020-01-01", to: "2020-12-31" });
    expect(q.getActivationSettings).toHaveBeenCalledWith(TENANT);
    expect(q.getBudgetVsActual).toHaveBeenCalledWith(TENANT, "2026-04-01", "2026-09-30");
    expect(workbook.metadata).toMatchObject({ "Fiscal year": expect.stringContaining("2026"), From: "2026-04-01", To: "2026-09-30" });

    q.getActivationSettings.mockResolvedValue({ accountingMethod: "accrual", fiscalYearStartMonth: 1 });
    await runAdapter(financeBudgetExport);
    expect(q.getBudgetVsActual).toHaveBeenLastCalledWith(TENANT, "2026-01-01", "2026-09-30");
  });

  it("writes Summary, Budget, Actual and Variance; CSV is the variance table; no budget stays blank", async () => {
    const { workbook } = await runAdapter(financeBudgetExport);
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["Summary", "Budget", "Actual", "Variance"]);
    expect(workbook.csvSheet).toBe("Variance");
    expect(headers(workbook, "Variance")).toEqual([
      "Account code", "Account", "Type", "Budgeted", "Actual", "Variance", "Variance % of budget", "Direction",
    ]);
    expect(rowValues(workbook, "Variance", 0)).toMatchObject({ Type: "Expense", "Variance % of budget": null, Direction: "Adverse" });
    expect(rowValues(workbook, "Variance", 1)).toMatchObject({ "Variance % of budget": -0.1 });
    expect(rowValues(workbook, "Summary", 4)).toEqual({ Measure: "Profit variance", Amount: -35000, Direction: "Adverse" });
    const lines = await csvLines(workbook);
    expect(lines[0]).toBe("Account code,Account,Type,Budgeted,Actual,Variance,Variance % of budget,Direction");
    expect(lines[1]).toBe("6100,Rent,Expense,0,25000,25000,,Adverse");
  });
});
