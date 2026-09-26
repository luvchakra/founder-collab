import ExcelJS from "exceljs";
import { expect, type Page } from "@playwright/test";

/**
 * §53's one reusable export helper: drives the page's real Export control (the shared
 * ExportMenu, found by its `data-export-id`), picks the scope when the page offers one,
 * clicks the format, waits for the browser download, and returns the file parsed so a
 * spec can assert on its contents -- not merely that "a download happened" (§54).
 */
export type ExportedFile = {
  filename: string;
  /** CSV: every row including the header, split on commas with quotes honoured. */
  rows: string[][];
  /** XLSX: every worksheet's rows (header first), by sheet name. */
  sheets: Record<string, unknown[][]>;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && body[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else field += char;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function exportData(
  page: Page,
  exportId: string,
  format: "csv" | "xlsx",
  scope?: "view" | "all",
): Promise<ExportedFile> {
  await page.locator(`[data-export-id="${exportId}"]`).first().click();
  if (scope) {
    await page.getByRole("menuitemradio", { name: scope === "all" ? "All matching records" : "Current filtered view" }).click();
  }
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("menuitem", { name: format === "csv" ? /^CSV/ : /^Excel/ }).click();
  const download = await downloadPromise;
  const filename = download.suggestedFilename();
  expect(filename).toMatch(new RegExp(`^wonderark_[a-z0-9-]+_[a-z0-9-]+_\\d{4}-\\d{2}-\\d{2}\\.${format}$`));
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(path!);

  if (format === "csv") {
    // UTF-8 byte-order mark first, so Excel reads the file as UTF-8.
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    return { filename, rows: parseCsv(bytes.toString("utf8")), sheets: {} };
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const sheets: Record<string, unknown[][]> = {};
  book.eachSheet((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
    sheets[sheet.name] = rows;
  });
  return { filename, rows: [], sheets };
}
