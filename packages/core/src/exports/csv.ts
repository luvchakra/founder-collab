import { toCsvText } from "./format";
import type { ExportSheet } from "./types";

/**
 * EXP-PLAT-02 -- the one CSV writer (§10). RFC 4180: comma-separated, CRLF line ends,
 * a field quoted when it holds a comma, quote, or line break, quotes doubled inside it.
 * Prefixed with a UTF-8 byte-order mark so Excel opens `₹`, accented names and Indic
 * scripts correctly instead of guessing a legacy code page.
 *
 * Strictly tabular: one header row, then one row per record -- no title or metadata rows
 * that would trip up a machine reading the file (§14). An empty dataset is still a valid
 * file: the header row and nothing else (§39).
 */
export const UTF8_BOM = "﻿";

export function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(sheet: ExportSheet<T>, timeZone: string): string {
  const lines = [sheet.columns.map((column) => csvField(column.header)).join(",")];
  for (const row of sheet.rows) {
    lines.push(
      sheet.columns
        .map((column) => csvField(toCsvText(column.getValue(row), column.type ?? "text", timeZone)))
        .join(","),
    );
  }
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
