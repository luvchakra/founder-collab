import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-01 -- Finance Dashboard export.

const q = vi.hoisted(() => ({
  getComplianceDashboard: vi.fn(),
  getRiskDashboard: vi.fn(),
  getFilingCalendar: vi.fn(),
  getFinanceSnapshot: vi.fn(),
  listUnpostedDocuments: vi.fn(),
  getFinanceActivation: vi.fn(),
  getReceivablesForExport: vi.fn(),
  getPayablesForExport: vi.fn(),
  listBankAccounts: vi.fn(),
  getLedgerCurrency: vi.fn(),
}));
vi.mock("../lib/dashboard/queries", () => ({ getComplianceDashboard: q.getComplianceDashboard }));
vi.mock("../lib/risk/queries", () => ({ getRiskDashboard: q.getRiskDashboard }));
vi.mock("../lib/calendar/queries", () => ({ getFilingCalendar: q.getFilingCalendar }));
vi.mock("../lib/accounting/dashboard-queries", () => ({
  getFinanceSnapshot: q.getFinanceSnapshot,
  listUnpostedDocuments: q.listUnpostedDocuments,
}));
vi.mock("../lib/activation/queries", () => ({ getFinanceActivation: q.getFinanceActivation }));
vi.mock("./queries", () => ({ getReceivablesForExport: q.getReceivablesForExport, getPayablesForExport: q.getPayablesForExport }));
vi.mock("../lib/accounting/banking-queries", () => ({ listBankAccounts: q.listBankAccounts }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeDashboardExport } from "./dashboard";
import { TENANT, csvLines, everyValue, rowValues, runAdapter, sheet } from "./test-support";

const aging = { buckets: { current: 100, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 50 }, totalOutstanding: 150, overdue: 50, notYetDue: 100, count: 2 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  q.getComplianceDashboard.mockReset().mockResolvedValue({
    gstin: "27AAAAA0000A1Z5",
    period: "2026-09",
    payableThisMonth: 90,
    collectedThisMonth: 180,
    cgstCollected: 90,
    sgstCollected: 90,
    igstCollected: 0,
    einvoicesThisMonth: 3,
    riskCount: 1,
    ewayBillConfigured: false,
    einvoiceConfigured: true,
  });
  q.getRiskDashboard.mockReset().mockResolvedValue({
    signals: [{ kind: "unmatched_itc", severity: "medium", summary: "2B mismatch", relatedEntityType: "reconciliation_exception", relatedEntityId: "rx-1" }],
    counts: { high: 0, medium: 1, low: 0 },
  });
  q.getFilingCalendar.mockReset().mockResolvedValue([
    { returnType: "gstr3b", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-20", status: null, returnPeriodId: null },
    { returnType: "gstr1", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueDate: "2026-09-11", status: "filed", returnPeriodId: "rp" },
  ]);
  q.getFinanceSnapshot.mockReset().mockResolvedValue({
    cash: 12500, receivable: 150, payable: 0, gstPosition: 90, profitThisMonth: 2000, profitYearToDate: 9000, hasAccounts: true,
  });
  q.listUnpostedDocuments.mockReset().mockResolvedValue([]);
  q.getFinanceActivation.mockReset().mockResolvedValue({ activatedAt: "2026-04-02T00:00:00Z", activatedBy: "user-1" });
  q.getReceivablesForExport.mockReset().mockResolvedValue({ items: [], summary: aging, byParty: [] });
  q.getPayablesForExport.mockReset().mockResolvedValue({ items: [], summary: { ...aging, totalOutstanding: 0 }, bySupplier: [] });
  q.listBankAccounts.mockReset().mockResolvedValue([
    { id: "b-1", name: "HDFC Current", bank_name: "HDFC", account_number_last4: "4321", statementBalance: 12500, unmatchedCount: 0 },
  ]);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});
afterEach(() => vi.useRealTimers());

describe("EXP-FIN-01 finance.dashboard", () => {
  it("is Finance-licensed with the page's (empty) read permission", () => {
    expect(financeDashboardExport.id).toBe("finance.dashboard");
    expect(financeDashboardExport.module).toBe("gst");
    expect(financeDashboardExport.permissions).toEqual([]);
  });

  it("makes the page's reads -- same window, same as-of date -- for the context tenant only", async () => {
    await runAdapter(financeDashboardExport);
    expect(q.getComplianceDashboard).toHaveBeenCalledWith(TENANT);
    expect(q.getRiskDashboard).toHaveBeenCalledWith(TENANT, "2026-09-26");
    expect(q.getFilingCalendar).toHaveBeenCalledWith(TENANT, { monthsBack: 1, monthsForward: 2, quartersBack: 0, quartersForward: 1 });
    for (const fn of [q.getFinanceSnapshot, q.listUnpostedDocuments, q.getFinanceActivation, q.getReceivablesForExport, q.getPayablesForExport, q.listBankAccounts]) {
      expect(fn).toHaveBeenCalledWith(TENANT);
    }
  });

  it("writes Summary, Receivables, Payables, Cash, GST and Exceptions -- data, never a picture", async () => {
    const { workbook } = await runAdapter(financeDashboardExport);
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual([
      "Summary", "Receivables", "Payables", "Cash", "GST", "Upcoming filings", "Exceptions", "Unposted documents",
    ]);
    expect(rowValues(workbook, "Summary", 0)).toEqual({ Section: "Money", Measure: "Cash and bank", Amount: 12500, Count: null, Value: null });
    const lines = await csvLines(workbook);
    expect(lines).toContain("GST this month,e-Invoices generated,,3,");
    expect(lines).toContain("Setup,e-Way bill set up,,,No");
    expect(rowValues(workbook, "Receivables", 4)).toEqual({ Aging: "90+ days", Outstanding: 50 });
    expect(rowValues(workbook, "Upcoming filings", 0)).toMatchObject({ Return: "GSTR1", Status: "Filed" });
    expect(rowValues(workbook, "Upcoming filings", 1)).toMatchObject({ Return: "GSTR3B", Status: "Overdue 6d" });
    expect(rowValues(workbook, "Exceptions")).toEqual({
      Risk: "Unmatched ITC", Severity: "Medium", Summary: "2B mismatch", "Related to": "Reconciliation exception", "Related record": "rx-1",
    });
    expect(sheet(workbook, "Cash").rows).toHaveLength(1);
    expect(everyValue(workbook)).not.toMatch(/password|secret|token|credential/i);
  });

  it("with no chart of accounts, the money figures are blank rather than zero", async () => {
    q.getFinanceSnapshot.mockResolvedValue({ cash: 0, receivable: 0, payable: 0, gstPosition: 0, profitThisMonth: 0, profitYearToDate: 0, hasAccounts: false });
    const { workbook } = await runAdapter(financeDashboardExport);
    expect(rowValues(workbook, "Summary", 0).Amount).toBeNull();
  });
});
