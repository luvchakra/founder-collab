import { describe, expect, it } from "vitest";
import { toCsv, UTF8_BOM } from "./csv";
import type { ExportSheet } from "./types";

type Row = { name: string | null; note?: string; amount: number | null; when: string; active: boolean };

const sheet = (rows: Row[]): ExportSheet<Row> => ({
  sheetName: "Data",
  columns: [
    { key: "name", header: "Name", getValue: (r) => r.name },
    { key: "note", header: "Note", getValue: (r) => r.note },
    { key: "amount", header: "Amount", type: "currency", getValue: (r) => r.amount },
    { key: "when", header: "Created", type: "datetime", getValue: (r) => r.when },
    { key: "active", header: "Active", type: "boolean", getValue: (r) => r.active },
  ],
  rows,
});

// EXP-PLAT-02: the CSV engine's edge cases, one assertion each.
describe("toCsv", () => {
  it("starts with a UTF-8 BOM and ends every line with CRLF", () => {
    const out = toCsv(sheet([]), "UTC");
    expect(out.startsWith(UTF8_BOM)).toBe(true);
    expect(out).toBe(`${UTF8_BOM}Name,Note,Amount,Created,Active\r\n`);
  });

  it("quotes commas, quotes and line breaks, doubling embedded quotes", () => {
    const out = toCsv(
      sheet([{ name: 'Acme, "the best"', note: "line one\nline two", amount: 1250, when: "2026-09-26T05:00:00Z", active: true }]),
      "Asia/Kolkata",
    );
    expect(out.split("\r\n")[1]).toBe('"Acme, ""the best""","line one\nline two",1250,2026-09-26T10:30:00+05:30,Yes');
  });

  it("writes null and missing values as blank cells", () => {
    const out = toCsv(sheet([{ name: null, amount: null, when: "", active: false }]), "UTC");
    expect(out.split("\r\n")[1]).toBe(",,,,No");
  });

  it("neutralizes formula-like text", () => {
    const out = toCsv(sheet([{ name: "=HYPERLINK(\"x\")", amount: -100, when: "", active: true }]), "UTC");
    expect(out.split("\r\n")[1]).toBe('"\'=HYPERLINK(""x"")",,-100,,Yes');
  });

  it("is deterministic", () => {
    const rows: Row[] = [{ name: "A", amount: 1, when: "2026-01-01T00:00:00Z", active: true }];
    expect(toCsv(sheet(rows), "UTC")).toBe(toCsv(sheet(rows), "UTC"));
  });
});
