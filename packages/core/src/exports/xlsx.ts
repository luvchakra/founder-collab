import ExcelJS from "exceljs";
import { BRAND_NAME } from "../lib/brand";
import { neutralizeFormula, toDateOnly, toNumber, toText, toZonedIso, zonedParts } from "./format";
import type { ExportColumn, ExportColumnType, ExportRenderOptions, ExportWorkbookDefinition } from "./types";

/**
 * EXP-PLAT-03 -- the one Excel writer (§12), built on ExcelJS.
 *
 * Every sheet is a plain table: a bold, frozen header row with an autofilter, then one
 * row per record, typed -- numbers as numbers, dates as real date cells, money with a
 * currency format, percentages as fractions shown as `25.00%`. No merged cells, no
 * formulas, no external links, no macros: every cell is a literal value. Text that a
 * spreadsheet could read as a formula is neutralized exactly as in the CSV writer.
 *
 * Report parameters (period, filters, who generated it) go on a small trailing
 * "Export info" sheet rather than above the table, so the data sheets stay machine-
 * readable (§14).
 */

const EXCEL_MAX_TEXT = 32_767;
const SHEET_NAME_MAX = 31;

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", AUD: "A$", SGD: "S$", AED: "AED " };

function numFmtFor(column: ExportColumn<unknown>): string | undefined {
  switch (column.type) {
    case "integer":
      return "#,##0";
    case "number":
      return "#,##0.##";
    case "currency": {
      const symbol = column.currency ? CURRENCY_SYMBOL[column.currency.toUpperCase()] : undefined;
      return symbol ? `"${symbol}"#,##0.00` : "#,##0.00";
    }
    case "percent":
      return "0.00%";
    case "date":
      return "yyyy-mm-dd";
    case "datetime":
      return "yyyy-mm-dd hh:mm";
    default:
      return undefined;
  }
}

/** Excel stores a date as a zone-less serial, so a cell is given the business's own wall
 * clock as if it were UTC -- that is what ExcelJS turns into the serial, and what the
 * cell then shows. A `YYYY-MM-DD` date is taken as that exact calendar day (§40). */
function excelDate(value: unknown, type: "date" | "datetime", timeZone: string): Date | null {
  if (type === "date") {
    const day = toDateOnly(value, timeZone);
    if (!day) return null;
    const [y, m, d] = day.split("-").map(Number);
    return new Date(Date.UTC(y!, m! - 1, d!));
  }
  if (!toZonedIso(value, timeZone)) return null;
  const p = zonedParts(value instanceof Date ? value : new Date(String(value)), timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

export function excelCellValue(value: unknown, type: ExportColumnType, timeZone: string): ExcelJS.CellValue {
  switch (type) {
    case "number":
    case "integer":
    case "currency":
    case "percent":
      return toNumber(value);
    case "boolean":
      return value == null || value === "" ? null : value ? "Yes" : "No";
    case "date":
    case "datetime":
      return excelDate(value, type, timeZone);
    default: {
      const text = neutralizeFormula(toText(value));
      return text === "" ? null : text.slice(0, EXCEL_MAX_TEXT);
    }
  }
}

/** Excel forbids `[]:*?/\` in sheet names and caps them at 31 characters; two sheets can't
 * share a name. */
export function safeSheetName(name: string, taken: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, SHEET_NAME_MAX) || "Data";
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, SHEET_NAME_MAX - suffix.length)}${suffix}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function widthFor(column: ExportColumn<unknown>, rows: unknown[], timeZone: string): number {
  if (column.width) return column.width;
  let longest = column.header.length;
  for (const row of rows.slice(0, 200)) {
    const value = excelCellValue(column.getValue(row), column.type ?? "text", timeZone);
    const length = value instanceof Date ? (column.type === "datetime" ? 16 : 10) : String(value ?? "").length;
    if (length > longest) longest = length;
  }
  return Math.min(Math.max(longest + 2, 8), 60);
}

export async function toXlsx(workbook: ExportWorkbookDefinition, options: ExportRenderOptions): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  book.creator = BRAND_NAME;
  book.created = options.generatedAt;
  book.modified = options.generatedAt;

  const taken = new Set<string>();
  for (const sheet of workbook.sheets) {
    const columns = sheet.columns as ExportColumn<unknown>[];
    const worksheet = book.addWorksheet(safeSheetName(sheet.sheetName, taken), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    worksheet.columns = columns.map((column) => ({
      key: column.key,
      header: column.header,
      width: widthFor(column, sheet.rows, options.timeZone),
      style: numFmtFor(column) ? { numFmt: numFmtFor(column) } : {},
    }));
    worksheet.getRow(1).font = { bold: true };
    if (columns.length > 0) {
      worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    }
    for (const row of sheet.rows) {
      worksheet.addRow(columns.map((column) => excelCellValue(column.getValue(row), column.type ?? "text", options.timeZone)));
    }
  }

  const info: [string, string][] = [
    ["Report", workbook.title],
    ["Generated at", toZonedIso(options.generatedAt, options.timeZone) ?? ""],
    ...Object.entries(options.info ?? {}),
    ...Object.entries(workbook.metadata ?? {}),
  ];
  const infoSheet = book.addWorksheet(safeSheetName("Export info", taken));
  infoSheet.columns = [
    { header: "Field", key: "field", width: 18 },
    { header: "Value", key: "value", width: 60 },
  ];
  infoSheet.getRow(1).font = { bold: true };
  for (const [field, value] of info) infoSheet.addRow([field, neutralizeFormula(value)]);

  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
