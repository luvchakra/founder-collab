import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-11 -- Financial Statements export.

const q = vi.hoisted(() => ({ getActivationSettings: vi.fn(), getAccountPeriodTotals: vi.fn(), getLedgerCurrency: vi.fn() }));
vi.mock("../lib/activation/queries", () => ({ getActivationSettings: q.getActivationSettings }));
// The statements themselves come from the real report-queries/reports code; only the
// ledger read underneath is stubbed.
vi.mock("../lib/accounting/report-queries", async (importOriginal) => {
  const reports = await import("../lib/accounting/reports");
  const original = await importOriginal<typeof import("../lib/accounting/report-queries")>();
  return {
    ...original,
    getFinancialStatements: async (businessId: string, period: { from: string; to: string }) => {
      const totals = await q.getAccountPeriodTotals(businessId, period.from, period.to);
      return {
        trialBalance: reports.trialBalance(totals),
        profitAndLoss: reports.profitAndLoss(totals),
        balanceSheet: reports.balanceSheet(totals),
        cashFlow: reports.cashFlowStatement(
          [
            { accountId: "a2", accountNumber: "3000", name: "Capital", type: "equity", subtype: null, amount: 10000 },
            { accountId: "a3", accountNumber: "4000", name: "Sales", type: "income", subtype: null, amount: 40000 },
            { accountId: "a4", accountNumber: "6100", name: "Rent", type: "expense", subtype: null, amount: -20000 },
          ],
          0,
          30000,
        ),
        hasActivity: true,
      };
    },
  };
});
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeStatementsExport } from "./statements";
import { TENANT, csvLines, exportContext, headers, params, rowValues, runAdapter } from "./test-support";

const TOTALS = [
  { accountId: "a1", accountNumber: "1000", name: "Bank", type: "asset", debit: 50000, credit: 20000, openingBalance: 0 },
  { accountId: "a2", accountNumber: "3000", name: "Capital", type: "equity", debit: 0, credit: 10000, openingBalance: 0 },
  { accountId: "a3", accountNumber: "4000", name: "Sales", type: "income", debit: 0, credit: 40000, openingBalance: 0 },
  { accountId: "a4", accountNumber: "6100", name: "Rent", type: "expense", debit: 20000, credit: 0, openingBalance: 0 },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  q.getActivationSettings.mockReset().mockResolvedValue({ accountingMethod: "accrual", fiscalYearStartMonth: 4 });
  q.getAccountPeriodTotals.mockReset().mockResolvedValue(TOTALS);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});
afterEach(() => vi.useRealTimers());

describe("EXP-FIN-11 finance.statements", () => {
  it("is Finance-licensed with the page's (empty) read permission", () => {
    expect(financeStatementsExport.id).toBe("finance.statements");
    expect(financeStatementsExport.module).toBe("gst");
    expect(financeStatementsExport.permissions).toEqual([]);
  });

  it("parses the page's report/from/to, defaulting an unknown report to profit and loss", () => {
    expect(financeStatementsExport.parseFilters!(params({ report: "balance-sheet", from: "2026-04-01", to: "2026-06-30", x: "y" }))).toEqual({
      report: "balance-sheet",
      from: "2026-04-01",
      to: "2026-06-30",
    });
    expect(financeStatementsExport.parseFilters!(params({ report: "cash-flow" })).report).toBe("cash-flow");
    expect(financeStatementsExport.parseFilters!(params({ report: "equity-changes" })).report).toBe("profit-and-loss");
  });

  it("sends the selected from/to to the ledger read for the context tenant; bad dates fall back to fiscal YTD", async () => {
    await runAdapter(financeStatementsExport, { from: "2026-04-01", to: "2026-06-30" });
    expect(q.getAccountPeriodTotals).toHaveBeenCalledWith(TENANT, "2026-04-01", "2026-06-30");
    await runAdapter(financeStatementsExport, { from: "yesterday", to: "2026-13" });
    expect(q.getAccountPeriodTotals).toHaveBeenLastCalledWith(TENANT, "2026-04-01", "2026-09-30");
  });

  it("CSV is the selected report only", async () => {
    const { workbook } = await runAdapter(financeStatementsExport, { report: "trial-balance" }, { format: "csv" });
    expect(workbook.csvSheet).toBe("Trial Balance");
    expect(workbook.resource).toBe("trial-balance");
    const lines = await csvLines(workbook);
    expect(lines[0]).toBe("Line type,Account code,Account,Type,Debit,Credit");
    expect(lines).toContain("Account,1000,Bank,Asset,30000,0");
    expect(lines.at(-1)).toBe("Total,,Total,,50000,50000");
  });

  it("Excel is all four statements for the period, the selected one first", async () => {
    const { workbook } = await runAdapter(financeStatementsExport, { report: "balance-sheet", from: "2026-04-01", to: "2026-09-30" });
    expect(workbook.resource).toBe("financial-statements");
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["Balance Sheet", "Profit & Loss", "Cash Flow", "Trial Balance"]);
    expect(workbook.metadata).toMatchObject({ Report: "Balance Sheet", From: "2026-04-01", To: "2026-09-30" });
    expect(headers(workbook, "Profit & Loss")).toEqual(["Section", "Line type", "Account code", "Account", "Amount"]);
    const pl = workbook.sheets.find((s) => s.sheetName === "Profit & Loss")!;
    const net = pl.rows.findIndex((r) => (r as { name: string }).name === "Net profit");
    expect(rowValues(workbook, "Profit & Loss", net)).toEqual({
      Section: "Net profit", "Line type": "Result", "Account code": null, Account: "Net profit", Amount: 20000,
    });
    const bs = workbook.sheets.find((s) => s.sheetName === "Balance Sheet")!;
    const profit = bs.rows.findIndex((r) => (r as { name: string }).name === "Profit to date");
    expect(rowValues(workbook, "Balance Sheet", profit)).toMatchObject({ Section: "Equity", Amount: 20000 });
    expect(rowValues(workbook, "Balance Sheet", profit + 1)).toMatchObject({ Account: "Total equity", Amount: 30000 });
    // FIN-5: the cash flow sheet, reconciled from opening to closing cash.
    const cf = workbook.sheets.find((s) => s.sheetName === "Cash Flow")!;
    const cfNet = cf.rows.findIndex((r) => (r as { name: string }).name === "Net change in cash");
    expect(rowValues(workbook, "Cash Flow", cfNet)).toMatchObject({ Amount: 30000 });
    expect(rowValues(workbook, "Cash Flow", cfNet + 2)).toMatchObject({ Account: "Cash and bank at the end", Amount: 30000 });
    expect(exportContext().businessId).toBe(TENANT);
  });
});
