import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { safeSheetName, toXlsx } from "./xlsx";
import type { ExportWorkbookDefinition } from "./types";

type Row = { name: string; amount: number | null; share: number; day: string; at: string; flag: boolean };

const workbook = (rows: Row[]): ExportWorkbookDefinition => ({
  module: "crm",
  resource: "leads",
  title: "CRM leads",
  metadata: { Filters: "Stage: Qualified" },
  sheets: [
    {
      sheetName: "Leads",
      columns: [
        { key: "name", header: "Name", getValue: (r: Row) => r.name },
        { key: "amount", header: "Value", type: "currency", currency: "INR", getValue: (r: Row) => r.amount },
        { key: "share", header: "Share", type: "percent", getValue: (r: Row) => r.share },
        { key: "day", header: "Close date", type: "date", getValue: (r: Row) => r.day },
        { key: "at", header: "Created", type: "datetime", getValue: (r: Row) => r.at },
        { key: "flag", header: "Won", type: "boolean", getValue: (r: Row) => r.flag },
      ],
      rows,
    },
    { sheetName: "A sheet name that is far too long for Excel", columns: [], rows: [] },
  ],
});

async function open(bytes: Uint8Array) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes.buffer as ArrayBuffer);
  return book;
}

// EXP-PLAT-03: open the generated workbook with ExcelJS and inspect it (§54).
describe("toXlsx", () => {
  const options = { timeZone: "Asia/Kolkata", generatedAt: new Date("2026-09-26T05:00:00Z"), info: { Business: "Acme" } };

  it("writes one sheet per dataset plus an Export info sheet, names within 31 characters", async () => {
    const book = await open(await toXlsx(workbook([]), options));
    expect(book.worksheets.map((ws) => ws.name)).toEqual(["Leads", "A sheet name that is far too lo", "Export info"]);
  });

  it("types every cell: numbers, currency, percent, dates, booleans", async () => {
    const book = await open(
      await toXlsx(
        workbook([{ name: "=cmd", amount: 125000, share: 0.25, day: "2026-09-30", at: "2026-09-26T05:00:00Z", flag: true }]),
        options,
      ),
    );
    const ws = book.getWorksheet("Leads")!;
    const row = ws.getRow(2);
    expect(row.getCell(1).value).toBe("'=cmd");
    expect(row.getCell(2).value).toBe(125000);
    expect(ws.getColumn(2).numFmt).toBe('"₹"#,##0.00');
    expect(row.getCell(3).value).toBe(0.25);
    expect(ws.getColumn(3).numFmt).toBe("0.00%");
    expect(row.getCell(4).value).toEqual(new Date(Date.UTC(2026, 8, 30)));
    // The business's wall clock: 05:00 UTC is 10:30 in Kolkata.
    expect(row.getCell(5).value).toEqual(new Date(Date.UTC(2026, 8, 26, 10, 30, 0)));
    expect(row.getCell(6).value).toBe("Yes");
  });

  it("keeps an unreported amount blank, never zero", async () => {
    const book = await open(await toXlsx(workbook([{ name: "A", amount: null, share: 0, day: "", at: "", flag: false }]), options));
    expect(book.getWorksheet("Leads")!.getRow(2).getCell(2).value).toBeNull();
  });

  it("freezes and filters the header row, in bold", async () => {
    const book = await open(await toXlsx(workbook([]), options));
    const ws = book.getWorksheet("Leads")!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.getRow(1).values).toEqual([undefined, "Name", "Value", "Share", "Close date", "Created", "Won"]);
  });

  it("records the report, time, business and filters on the Export info sheet", async () => {
    const book = await open(await toXlsx(workbook([]), options));
    const info = book.getWorksheet("Export info")!;
    const rows = info.getSheetValues().slice(2).map((r) => (r as unknown[]).slice(1));
    expect(rows).toEqual([
      ["Report", "CRM leads"],
      ["Generated at", "2026-09-26T10:30:00+05:30"],
      ["Business", "Acme"],
      ["Filters", "Stage: Qualified"],
    ]);
  });

  it("contains no formulas anywhere", async () => {
    const book = await open(
      await toXlsx(workbook([{ name: "=SUM(1,2)", amount: 1, share: 1, day: "", at: "", flag: true }]), options),
    );
    book.eachSheet((ws) =>
      ws.eachRow((row) => row.eachCell((cell) => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula))),
    );
  });
});

describe("safeSheetName", () => {
  it("strips characters Excel forbids and de-duplicates", () => {
    const taken = new Set<string>();
    expect(safeSheetName("P&L: 2026/27", taken)).toBe("P&L 2026 27");
    expect(safeSheetName("P&L: 2026/27", taken)).toBe("P&L 2026 27 (2)");
  });
});
