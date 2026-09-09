import ExcelJS from "exceljs";
import pdfParse from "pdf-parse";
import { parseProspectsCsv, type CsvParseResult } from "./csv";

function csvEscape(value: string): string {
  if (/["\n,]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function cellValueToText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return String(value.result ?? "");
    return "";
  }
  return String(value);
}

/** Converts an Excel workbook's first sheet into the same CSV text
 * `parseProspectsCsv` already understands, so there's exactly one place that maps
 * column headers onto prospect fields regardless of which file format they came from. */
async function excelToCsvText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own .d.ts pins a different (older) @types/node's `Buffer` shape than this
  // monorepo resolves to -- a duplicate-package type-declaration mismatch, not a real
  // runtime incompatibility, since a Node Buffer is exactly what `load()` needs and gets
  // here. `any` (not a same-type unknown cast, which TS still structurally rejects) is
  // the actual escape hatch for that mismatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return "";

  const lines: string[] = [];
  sheet.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    lines.push(values.map((v) => csvEscape(cellValueToText(v as ExcelJS.CellValue))).join(","));
  });
  return lines.join("\n");
}

export type ImportFileParseResult = {
  rows: CsvParseResult["rows"];
  errors: string[];
  /** Set when structured parsing (CSV/Excel header match) found nothing usable -- an
   * unrecognized header row -- or the file was a PDF with no tabular structure at all.
   * The caller feeds this to AI restructuring instead of failing the import outright. */
  rawTextForAi?: string;
};

/**
 * Parses an uploaded prospects-import file (CSV, Excel .xlsx, or PDF) into the same
 * `ProspectInput[]` shape the CSV-paste path already produces. CSV and Excel both try
 * the deterministic, free header-based parser first; whenever that comes back with zero
 * rows (most likely unrecognized headers, since `parseProspectsCsv` already reports a
 * genuinely empty file the same way) or the file is a PDF (no headers to recognize at
 * all), the raw extracted content is returned as `rawTextForAi` for the caller to run
 * through AI restructuring instead of hard-failing the import.
 */
export async function parseImportFile(file: File): Promise<ImportFileParseResult> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await pdfParse(buffer);
    return { rows: [], errors: [], rawTextForAi: text.trim() || undefined };
  }

  let csvText: string;
  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    name.endsWith(".xlsx")
  ) {
    const buffer = Buffer.from(await file.arrayBuffer());
    csvText = await excelToCsvText(buffer);
  } else {
    csvText = await file.text();
  }

  const result = parseProspectsCsv(csvText);
  if (result.rows.length > 0) return result;
  return { rows: [], errors: result.errors, rawTextForAi: csvText.trim() || undefined };
}
