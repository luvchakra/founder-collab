import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-04 (Payables) and EXP-FIN-05 (Receivables) exports.

const q = vi.hoisted(() => ({ getPayablesForExport: vi.fn(), getReceivablesForExport: vi.fn(), getLedgerCurrency: vi.fn() }));
vi.mock("./queries", () => ({ getPayablesForExport: q.getPayablesForExport, getReceivablesForExport: q.getReceivablesForExport }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financePayablesExport, financeReceivablesExport } from "./payables";
import { TENANT, headers, renderText, rowValues, runAdapter } from "./test-support";

const buckets = { current: 0, "1-30": 0, "31-60": 500, "61-90": 0, "90+": 0 };
const item = {
  id: "doc-9",
  number: "BILL-0009",
  partyId: "party-1",
  partyName: "Sharma Supplies",
  docDate: "2026-07-01",
  dueDate: "2026-08-01",
  total: 800,
  credited: 100,
  paid: 200,
  outstanding: 500,
  status: "partially_paid",
  bucket: "31-60",
};
const summary = { buckets, totalOutstanding: 500, overdue: 500, notYetDue: 0, count: 1 };

beforeEach(() => {
  q.getPayablesForExport.mockReset().mockResolvedValue({
    items: [item],
    summary,
    bySupplier: [{ partyId: "party-1", partyName: "Sharma Supplies", buckets, total: 500, count: 1 }],
  });
  q.getReceivablesForExport.mockReset().mockResolvedValue({
    items: [{ ...item, number: "INV-0001", partyName: "Mehta & Co" }],
    summary,
    byParty: [{ partyId: "party-2", partyName: "Mehta & Co", buckets, total: 500, count: 1 }],
  });
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});

describe("EXP-FIN-04 finance.payables", () => {
  it("is Finance-licensed with the page's (empty) read permission and reads only the context tenant", async () => {
    expect(financePayablesExport.id).toBe("finance.payables");
    expect(financePayablesExport.module).toBe("gst");
    expect(financePayablesExport.permissions).toEqual([]);
    await runAdapter(financePayablesExport);
    expect(q.getPayablesForExport).toHaveBeenCalledWith(TENANT);
  });

  it("exports supplier, document, due date, outstanding, aging bucket and status", async () => {
    const { workbook } = await runAdapter(financePayablesExport);
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["Open bills", "By supplier", "Aging summary"]);
    expect(headers(workbook, "Open bills")).toEqual([
      "Supplier", "Document", "Document date", "Due date", "Total", "Credited", "Paid", "Outstanding", "Aging", "Status",
    ]);
    expect(rowValues(workbook, "Open bills")).toMatchObject({ Outstanding: 500, Aging: "31–60 days", Status: "Part paid" });
    expect(headers(workbook, "By supplier")).toEqual([
      "Supplier", "Current", "1–30 days", "31–60 days", "61–90 days", "90+ days", "Total outstanding", "Open documents",
    ]);
    const csv = await renderText(workbook);
    expect(csv).toContain("Sharma Supplies,BILL-0009,2026-07-01,2026-08-01,800,100,200,500,31–60 days,Part paid");
  });
});

describe("EXP-FIN-05 finance.receivables", () => {
  it("is Finance-licensed and reads only the context tenant", async () => {
    expect(financeReceivablesExport.id).toBe("finance.receivables");
    expect(financeReceivablesExport.module).toBe("gst");
    expect(financeReceivablesExport.permissions).toEqual([]);
    await runAdapter(financeReceivablesExport, { businessId: "someone-else" });
    expect(q.getReceivablesForExport).toHaveBeenCalledWith(TENANT);
  });

  it("exports customer, invoice, due date, outstanding, aging and status", async () => {
    const { workbook } = await runAdapter(financeReceivablesExport);
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["Open invoices", "By customer", "Aging summary"]);
    expect(rowValues(workbook, "Open invoices")).toMatchObject({ Customer: "Mehta & Co", Document: "INV-0001", Aging: "31–60 days" });
    expect(rowValues(workbook, "Aging summary", 6)).toEqual({ Aging: "Total outstanding", Outstanding: 500 });
  });
});
