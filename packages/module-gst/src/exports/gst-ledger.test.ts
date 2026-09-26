import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-07 -- GST Ledger export.

const q = vi.hoisted(() => ({
  getActivationSettings: vi.fn(),
  getGstLedgerSummary: vi.fn(),
  getSalesRegister: vi.fn(),
  getPurchaseRegister: vi.fn(),
  getPurchaseReconciliation: vi.fn(),
  getLedgerCurrency: vi.fn(),
}));
vi.mock("../lib/activation/queries", () => ({ getActivationSettings: q.getActivationSettings }));
vi.mock("../lib/accounting/gst-ledger-queries", () => ({ getGstLedgerSummary: q.getGstLedgerSummary }));
vi.mock("../lib/filing/queries", () => ({ getSalesRegister: q.getSalesRegister, getPurchaseRegister: q.getPurchaseRegister }));
vi.mock("../lib/reconciliation/queries", () => ({ getPurchaseReconciliation: q.getPurchaseReconciliation }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeGstLedgerExport } from "./gst-ledger";
import { PURCHASES, SALES, TENANT, csvLines, headers, rowValues, runAdapter } from "./test-support";

const totals = (cgst: number, sgst: number) => ({ CGST: cgst, SGST: sgst, IGST: 0, CESS: 0, total: cgst + sgst });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  q.getActivationSettings.mockReset().mockResolvedValue({ accountingMethod: "accrual", fiscalYearStartMonth: 4 });
  q.getGstLedgerSummary.mockReset().mockResolvedValue({ output: totals(90, 90), input: totals(45, 45), netPayable: 90, hasAccounts: true });
  q.getSalesRegister.mockReset().mockResolvedValue(SALES);
  q.getPurchaseRegister.mockReset().mockResolvedValue(PURCHASES);
  q.getPurchaseReconciliation.mockReset().mockResolvedValue(null);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});
afterEach(() => vi.useRealTimers());

describe("EXP-FIN-07 finance.gst-ledger", () => {
  it("is Finance-licensed with the page's (empty) read permission", () => {
    expect(financeGstLedgerExport.id).toBe("finance.gst-ledger");
    expect(financeGstLedgerExport.module).toBe("gst");
    expect(financeGstLedgerExport.permissions).toEqual([]);
  });

  it("takes the page's ?period, and every read is for that month and the context's business", async () => {
    const { filters, workbook } = await runAdapter(financeGstLedgerExport, { period: "2026-08", status: "x" });
    expect(filters).toEqual({ period: "2026-08" });
    expect(q.getActivationSettings).toHaveBeenCalledWith(TENANT);
    expect(q.getGstLedgerSummary).toHaveBeenCalledWith(TENANT, "2026-08-01", "2026-08-31");
    expect(q.getSalesRegister).toHaveBeenCalledWith(TENANT, "2026-08-01", "2026-08-31");
    expect(q.getPurchaseRegister).toHaveBeenCalledWith(TENANT, "2026-08-01", "2026-08-31");
    expect(q.getPurchaseReconciliation).toHaveBeenCalledWith(TENANT, "2026-08");
    expect(workbook.metadata).toMatchObject({ Period: "2026-08", From: "2026-08-01", To: "2026-08-31" });
  });

  it("falls back to the current month, as the page does, for a period outside the fiscal year", async () => {
    await runAdapter(financeGstLedgerExport, { period: "2019-01" });
    expect(q.getGstLedgerSummary).toHaveBeenCalledWith(TENANT, "2026-09-01", "2026-09-30");
  });

  it("writes GST Summary, both registers, ITC and Reconciliation, the summary as the CSV", async () => {
    const { workbook } = await runAdapter(financeGstLedgerExport, { period: "2026-08" });
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual([
      "GST Summary", "Sales Register", "Sales B2C by state", "Sales credit notes", "Purchase Register", "ITC", "Reconciliation",
    ]);
    expect(headers(workbook, "GST Summary")).toEqual(["Component", "Output tax (on sales)", "Input tax credit (on purchases)", "Net payable"]);
    // Components with no activity are left out, as on the page; the total row closes it.
    expect(rowValues(workbook, "GST Summary", 0)).toEqual({ Component: "CGST", "Output tax (on sales)": 90, "Input tax credit (on purchases)": 45, "Net payable": 45 });
    expect(rowValues(workbook, "GST Summary", 2)).toMatchObject({ Component: "Total", "Net payable": 90 });
    expect(rowValues(workbook, "Sales Register")).toMatchObject({ "Invoice number": "INV-1", "Total tax": 180 });
    expect(rowValues(workbook, "Purchase Register")).toMatchObject({ "Supplier GSTIN": null, "Total tax": 90 });
    expect(rowValues(workbook, "ITC", 4)).toMatchObject({ Measure: "Risk", Amount: null });
    expect(rowValues(workbook, "Reconciliation", 0)).toMatchObject({ Line: "Output tax (on sales)", "Per books (ledger)": 180, "Per return (registers)": 180, Agrees: true });

    expect((await csvLines(workbook))[1]).toBe("CGST,90,45,45");
  });

  it("with no GST accounts mapped, the summary and ITC are empty rather than confident zeroes", async () => {
    q.getGstLedgerSummary.mockResolvedValue({ output: totals(0, 0), input: totals(0, 0), netPayable: 0, hasAccounts: false });
    const { workbook } = await runAdapter(financeGstLedgerExport);
    expect(workbook.sheets[0]!.rows).toEqual([]);
    expect(workbook.metadata?.Note).toMatch(/No GST accounts/);
  });
});
