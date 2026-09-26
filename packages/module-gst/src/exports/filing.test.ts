import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-12 -- Filing export.

const q = vi.hoisted(() => ({
  getBusinessGstFilingProfile: vi.fn(),
  getSalesRegister: vi.fn(),
  getPurchaseRegister: vi.fn(),
  getLedgerCurrency: vi.fn(),
}));
vi.mock("../lib/filing/queries", () => ({
  getBusinessGstFilingProfile: q.getBusinessGstFilingProfile,
  getSalesRegister: q.getSalesRegister,
  getPurchaseRegister: q.getPurchaseRegister,
}));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeFilingExport } from "./filing";
import { PURCHASES, SALES, TENANT, csvLines, everyValue, headers, rowValues, runAdapter } from "./test-support";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
  q.getBusinessGstFilingProfile.mockReset().mockResolvedValue({ gstin: "27AAAAA0000A1Z5", gst_registration_type: "regular" });
  q.getSalesRegister.mockReset().mockResolvedValue(SALES);
  q.getPurchaseRegister.mockReset().mockResolvedValue(PURCHASES);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});
afterEach(() => vi.useRealTimers());

describe("EXP-FIN-12 finance.filing", () => {
  it("is Finance-licensed with the page's (empty) read permission", () => {
    expect(financeFilingExport.id).toBe("finance.filing");
    expect(financeFilingExport.module).toBe("gst");
    expect(financeFilingExport.permissions).toEqual([]);
  });

  it("reads the selected ?period's month for the context's business", async () => {
    const { filters } = await runAdapter(financeFilingExport, { period: "2024-02" });
    expect(filters).toEqual({ period: "2024-02" });
    expect(q.getBusinessGstFilingProfile).toHaveBeenCalledWith(TENANT);
    expect(q.getPurchaseRegister).toHaveBeenCalledWith(TENANT, "2024-02-01", "2024-02-29");
    expect(q.getSalesRegister).toHaveBeenCalledWith(TENANT, "2024-02-01", "2024-02-29");
  });

  it("uses this month when the period is absent or malformed", async () => {
    await runAdapter(financeFilingExport, { period: "../../etc" });
    expect(q.getSalesRegister).toHaveBeenCalledWith(TENANT, "2026-09-01", "2026-09-30");
  });

  it("CSV is the filing summary with period, GSTIN and tax components; Excel adds the registers", async () => {
    const { workbook } = await runAdapter(financeFilingExport, { period: "2026-08" });
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual([
      "Filing summary", "Sales B2B invoices", "Sales B2C by state", "Sales by HSN", "Sales credit notes",
      "Purchase Register", "Purchases by supplier", "Purchases by HSN",
    ]);
    expect(headers(workbook, "Filing summary")).toEqual([
      "Period", "GSTIN", "Registration type", "Section", "Documents", "Taxable value", "CGST", "SGST", "IGST", "Total tax",
    ]);
    expect(rowValues(workbook, "Filing summary", 1)).toMatchObject({ Section: "Credit notes issued", CGST: null, "Total tax": 0 });
    const lines = await csvLines(workbook);
    expect(lines[1]).toBe("2026-08,27AAAAA0000A1Z5,Regular,Outward supplies (sales),1,1000,90,90,0,180");
    expect(lines[4]).toBe("2026-08,27AAAAA0000A1Z5,Regular,\"Inward supplies (purchases, ITC)\",1,500,45,45,0,90");
    expect(workbook.metadata).toMatchObject({ Period: "2026-08", GSTIN: "27AAAAA0000A1Z5" });
    expect(everyValue(workbook)).not.toMatch(/password|secret|token|api_key/i);
  });
});
