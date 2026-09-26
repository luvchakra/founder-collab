import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-03 -- Bills and Expenses export.

const q = vi.hoisted(() => ({ listBillsForExport: vi.fn(), getLedgerCurrency: vi.fn() }));
vi.mock("./queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queries")>()),
  listBillsForExport: q.listBillsForExport,
}));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeBillsExport, financeExpensesExport } from "./bills";
import { TENANT, everyValue, headers, renderText, rowValues, runAdapter, sheet } from "./test-support";

const BILL = {
  id: "doc-1",
  number: "BILL-0007",
  partyName: "Sharma Supplies",
  docDate: "2026-09-01",
  dueDate: null,
  taxableValue: 1000,
  cgst: 90,
  sgst: 90,
  igst: 0,
  total: 1180,
  paid: 180,
  outstanding: 1000,
  status: "partially_paid",
  kind: "bill",
  gstSplitIncomplete: false,
  postingState: "not_posted",
};

beforeEach(() => {
  q.listBillsForExport.mockReset().mockResolvedValue([BILL]);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});

describe("EXP-FIN-03 finance.bills / finance.expenses", () => {
  it("are Finance-licensed, with the pages' (empty) read permission", () => {
    expect(financeBillsExport.id).toBe("finance.bills");
    expect(financeExpensesExport.id).toBe("finance.expenses");
    for (const adapter of [financeBillsExport, financeExpensesExport]) {
      expect(adapter.module).toBe("gst");
      expect(adapter.permissions).toEqual([]);
    }
  });

  it("reads every bill (not the page's 200) for the context's business only", async () => {
    await runAdapter(financeBillsExport, { kind: "expense" });
    expect(q.listBillsForExport).toHaveBeenCalledWith(TENANT, "bill");
    await runAdapter(financeExpensesExport);
    expect(q.listBillsForExport).toHaveBeenLastCalledWith(TENANT, "expense");
  });

  it("writes document, supplier, dates, taxable, GST, total, payment and posting state", async () => {
    const { workbook } = await runAdapter(financeBillsExport);
    expect(headers(workbook, "Bills")).toEqual([
      "Document number", "Supplier", "Date", "Due date", "Taxable value", "CGST", "SGST", "IGST", "GST total",
      "Total", "Paid", "Outstanding", "Payment status", "Posting status", "GST split incomplete",
    ]);
    expect(rowValues(workbook, "Bills")).toMatchObject({
      "Document number": "BILL-0007",
      "Due date": null, // blank stays blank
      "GST total": 180,
      Total: 1180,
      "Payment status": "Part paid",
      "Posting status": "Not posted",
    });
    expect(sheet(workbook, "Bills").columns.find((c) => c.header === "Total")?.currency).toBe("INR");
    const csv = await renderText(workbook);
    expect(csv).toContain("BILL-0007,Sharma Supplies,2026-09-01,,1000,90,90,0,180,1180,180,1000,Part paid,Not posted,No");
    expect(everyValue(workbook)).not.toContain("doc-1");
  });

  it("labels the party column for expenses and keeps an empty list a valid file", async () => {
    q.listBillsForExport.mockResolvedValue([]);
    const { workbook } = await runAdapter(financeExpensesExport);
    expect(workbook.resource).toBe("expenses");
    expect(headers(workbook, "Expenses")[1]).toBe("Paid to");
    expect((await renderText(workbook)).trim().split("\n")).toHaveLength(1);
  });
});
