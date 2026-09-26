import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-FIN-06 -- Journal export.

const q = vi.hoisted(() => ({ listJournalForExport: vi.fn(), listAccountingPeriods: vi.fn(), getLedgerCurrency: vi.fn() }));
vi.mock("./queries", () => ({ listJournalForExport: q.listJournalForExport }));
vi.mock("../lib/accounting/queries", () => ({ listAccountingPeriods: q.listAccountingPeriods }));
vi.mock("./shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./shared")>()),
  getLedgerCurrency: q.getLedgerCurrency,
}));

import { financeJournalExport } from "./journal";
import { TENANT, everyValue, headers, renderText, rowValues, runAdapter } from "./test-support";

const entry = (overrides: Record<string, unknown>) => ({
  id: "e-1",
  entry_number: "JE-0002",
  posting_date: "2026-09-10",
  document_date: "2026-09-09",
  period_id: "p-sep",
  memo: null,
  status: "posted",
  source_module: "inventory",
  source_entity_type: "sales_invoice",
  source_document_id: "doc-1",
  posting_rule_key: "invoice",
  reversal_of_entry_id: null,
  posted_at: "2026-09-10T05:00:00Z",
  sourceDocumentNumber: "INV-0042",
  ...overrides,
});
const line = (overrides: Record<string, unknown>) => ({
  id: "l-1",
  entry_id: "e-1",
  line_number: 1,
  account_id: "acc-ar",
  account_number: "1100",
  account_name: "Accounts receivable",
  debit: 1180,
  credit: 0,
  memo: null,
  tax_code: null,
  ...overrides,
});

beforeEach(() => {
  q.listJournalForExport.mockReset().mockResolvedValue({
    entries: [
      entry({}),
      entry({ id: "e-0", entry_number: "JE-0001", posting_date: "2026-08-02", period_id: null, source_module: null, memo: "Opening cash", sourceDocumentNumber: null, source_document_id: null, status: "draft" }),
    ],
    lines: [
      line({ id: "l-2", line_number: 2, account_id: "acc-sales", account_number: "4000", account_name: "Sales", debit: 0, credit: 1000 }),
      line({}),
      line({ id: "l-3", line_number: 3, account_id: "acc-gst", account_number: "2200", account_name: "GST collected", debit: 0, credit: 180, tax_code: "CGST" }),
      line({ id: "l-4", entry_id: "e-0", account_id: "acc-cash", account_number: "1000", account_name: "Cash", debit: 500 }),
    ],
  });
  q.listAccountingPeriods.mockReset().mockResolvedValue([
    { id: "p-sep", fiscal_year: 2026, start_date: "2026-09-01", end_date: "2026-09-30", gst_period: "2026-09", status: "open", closed_at: null },
    { id: "p-aug", fiscal_year: 2026, start_date: "2026-08-01", end_date: "2026-08-31", gst_period: "2026-08", status: "locked", closed_at: null },
  ]);
  q.getLedgerCurrency.mockReset().mockResolvedValue("INR");
});

describe("EXP-FIN-06 finance.journal", () => {
  it("is Finance-licensed with the page's (empty) read permission and reads only the context tenant", async () => {
    expect(financeJournalExport.id).toBe("finance.journal");
    expect(financeJournalExport.module).toBe("gst");
    expect(financeJournalExport.permissions).toEqual([]);
    const { filters } = await runAdapter(financeJournalExport, { status: "draft", limit: "5" });
    expect(filters).toEqual({});
    expect(q.listJournalForExport).toHaveBeenCalledWith(TENANT);
    expect(q.listAccountingPeriods).toHaveBeenCalledWith(TENANT);
  });

  it("writes one row per line, in entry and line order, with its entry's number, period, source and status", async () => {
    const { workbook } = await runAdapter(financeJournalExport);
    expect(workbook.csvSheet).toBeUndefined();
    expect(workbook.sheets.map((s) => s.sheetName)).toEqual(["Journal lines", "Entries"]);
    expect(headers(workbook, "Journal lines")).toEqual([
      "Journal number", "Posting date", "Period", "Source", "Reference", "Line", "Account code", "Account",
      "Debit", "Credit", "Tax code", "Line memo", "Description", "Posting status",
    ]);
    expect(rowValues(workbook, "Journal lines", 0)).toMatchObject({
      "Journal number": "JE-0002",
      Period: "2026-09",
      Source: "Inventory",
      Reference: "INV-0042",
      Line: 1,
      "Account code": "1100",
      Debit: 1180,
      Credit: 0,
      Description: "Posted automatically from a sales invoice in Inventory.",
      "Posting status": "Posted",
    });
    expect(rowValues(workbook, "Journal lines", 1)).toMatchObject({ Line: 2, "Account code": "4000", Credit: 1000 });
    // A manual draft with no period id still gets its period from its date.
    expect(rowValues(workbook, "Journal lines", 3)).toMatchObject({
      "Journal number": "JE-0001",
      Period: "2026-08",
      Source: "By hand",
      Reference: null,
      Description: "Opening cash",
      "Posting status": "Draft",
    });
    expect(rowValues(workbook, "Entries", 0)).toMatchObject({ Amount: 1180, Balanced: true });
    expect(rowValues(workbook, "Entries", 1)).toMatchObject({ Amount: 500, Balanced: false });

    const csv = await renderText(workbook);
    expect(csv.split("\n")[2]).toContain("JE-0002,2026-09-10,2026-09,Inventory,INV-0042,2,4000,Sales,0,1000");
    expect(everyValue(workbook)).not.toContain("acc-ar");
  });
});
