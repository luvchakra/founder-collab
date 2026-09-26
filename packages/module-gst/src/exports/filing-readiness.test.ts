import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-13 -- Filing Readiness export.

const q = vi.hoisted(() => ({
  getActivationSettings: vi.fn(),
  getGstLedgerSummary: vi.fn(),
  getSalesRegister: vi.fn(),
  getPurchaseRegister: vi.fn(),
  getPurchaseReconciliation: vi.fn(),
  listUnpostedDocuments: vi.fn(),
  listAccountingPeriods: vi.fn(),
  listBankAccounts: vi.fn(),
  listBankTransactions: vi.fn(),
  getLedgerCurrency: vi.fn(),
}));
vi.mock("../lib/activation/queries", () => ({ getActivationSettings: q.getActivationSettings }));
vi.mock("../lib/accounting/gst-ledger-queries", () => ({ getGstLedgerSummary: q.getGstLedgerSummary }));
vi.mock("../lib/filing/queries", () => ({ getSalesRegister: q.getSalesRegister, getPurchaseRegister: q.getPurchaseRegister }));
vi.mock("../lib/reconciliation/queries", () => ({ getPurchaseReconciliation: q.getPurchaseReconciliation }));
vi.mock("../lib/accounting/dashboard-queries", () => ({ listUnpostedDocuments: q.listUnpostedDocuments }));
vi.mock("../lib/accounting/queries", () => ({ listAccountingPeriods: q.listAccountingPeriods }));
vi.mock("../lib/accounting/banking-queries", () => ({ listBankAccounts: q.listBankAccounts, listBankTransactions: q.listBankTransactions }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeFilingReadinessExport } from "./filing-readiness";
import { PURCHASES, SALES, TENANT, headers, rowValues, runAdapter, sheet } from "./test-support";

const totals = (cgst: number) => ({ CGST: cgst, SGST: cgst, IGST: 0, CESS: 0, total: cgst * 2 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  q.getActivationSettings.mockReset().mockResolvedValue({ accountingMethod: "accrual", fiscalYearStartMonth: 4 });
  // Books hold 200 output tax, the register 180: a 20 gap the reconciliation check reports.
  q.getGstLedgerSummary.mockReset().mockResolvedValue({ output: totals(100), input: totals(45), netPayable: 110, hasAccounts: true });
  q.getSalesRegister.mockReset().mockResolvedValue(SALES);
  q.getPurchaseRegister.mockReset().mockResolvedValue(PURCHASES);
  q.getPurchaseReconciliation.mockReset().mockResolvedValue(null);
  q.listUnpostedDocuments.mockReset().mockResolvedValue([
    { id: "d-1", doc_type: "invoice", number: "INV-9", doc_date: "2026-08-20", total_amount: 1180, source_module: "service" },
    { id: "d-2", doc_type: "invoice", number: "INV-3", doc_date: "2026-07-02", total_amount: 50, source_module: "service" },
  ]);
  q.listAccountingPeriods.mockReset().mockResolvedValue([
    { id: "p-aug", fiscal_year: 2026, start_date: "2026-08-01", end_date: "2026-08-31", gst_period: "2026-08", status: "open", closed_at: null },
  ]);
  q.listBankAccounts.mockReset().mockResolvedValue([{ id: "bank-1" }]);
  q.listBankTransactions.mockReset().mockResolvedValue([
    { id: "t-1", txn_date: "2026-08-10", status: "unmatched", amount: 10 },
    { id: "t-2", txn_date: "2026-09-10", status: "unmatched", amount: 10 },
  ]);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});
afterEach(() => vi.useRealTimers());

describe("EXP-FIN-13 finance.filing-readiness", () => {
  it("is Finance-licensed with the page's (empty) read permission", () => {
    expect(financeFilingReadinessExport.id).toBe("finance.filing-readiness");
    expect(financeFilingReadinessExport.module).toBe("gst");
    expect(financeFilingReadinessExport.permissions).toEqual([]);
  });

  it("assesses the selected period from the context tenant's own reads", async () => {
    await runAdapter(financeFilingReadinessExport, { period: "2026-08" });
    expect(q.getGstLedgerSummary).toHaveBeenCalledWith(TENANT, "2026-08-01", "2026-08-31");
    expect(q.getPurchaseReconciliation).toHaveBeenCalledWith(TENANT, "2026-08");
    expect(q.listUnpostedDocuments).toHaveBeenCalledWith(TENANT);
    expect(q.listAccountingPeriods).toHaveBeenCalledWith(TENANT);
    expect(q.listBankTransactions).toHaveBeenCalledWith(TENANT, "bank-1");
  });

  it("writes each check with category, status label, figure, detail, and the period's unposted documents", async () => {
    const { workbook } = await runAdapter(financeFilingReadinessExport, { period: "2026-08" });
    expect(headers(workbook, "Checks")).toEqual(["Period", "Category", "Check", "Status", "Amount", "Count", "Detail", "What to do"]);
    const checks = sheet(workbook, "Checks").rows as { key: string }[];
    const at = (key: string) => rowValues(workbook, "Checks", checks.findIndex((c) => c.key === key));
    expect(at("posted")).toMatchObject({ Period: "2026-08", Category: "Ledger", Count: 1, Amount: null, Status: "Must fix" });
    expect(at("reconciled")).toMatchObject({ Category: "GST reconciliation", Amount: 20 });
    expect(at("bank")).toMatchObject({ Category: "Bank", Count: 1 });
    expect(at("accounts")).toMatchObject({ Status: "Fine", Amount: null, Count: null });
    expect(sheet(workbook, "Unposted documents").rows).toHaveLength(1);
    expect(rowValues(workbook, "Unposted documents")).toMatchObject({ "Document type": "Invoice", "Document number": "INV-9", Source: "Service" });
    expect(workbook.metadata).toMatchObject({ Period: "2026-08", "Safe to file": "No" });
  });
});
