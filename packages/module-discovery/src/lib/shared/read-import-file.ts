import ExcelJS from "exceljs";
import pdfParse from "pdf-parse";

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

/** Converts an Excel workbook's first sheet into CSV text, so every caller of
 * `readImportFile` below has exactly one CSV-parsing implementation to write against
 * regardless of which of the two structured formats (CSV, Excel) the file came in. */
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

export type ReadImportFileResult = {
  text: string;
  /** true for CSV/Excel (worth trying a deterministic header-based parse on `text`,
   * which is CSV either way); false for PDF (plain extracted text, no columns to
   * deterministically parse at all -- callers fall back to a looser heuristic or, where
   * one exists and a billing context does, AI restructuring). */
  structured: boolean;
};

/**
 * Reads an uploaded import file (CSV, Excel .xlsx, or PDF) into text, shared by every
 * bulk-import feature in this module (prospects, products, ...) so the file-format
 * handling itself -- Excel's own binary format, PDF text extraction -- is written once.
 * Each feature keeps its own header-to-fields mapping on top of this (the columns a
 * prospect import needs are not the columns a product import needs).
 */
export async function readImportFile(file: File): Promise<ReadImportFileResult> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await pdfParse(buffer);
    return { text: text.trim(), structured: false };
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    name.endsWith(".xlsx")
  ) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return { text: await excelToCsvText(buffer), structured: true };
  }

  return { text: await file.text(), structured: true };
}
