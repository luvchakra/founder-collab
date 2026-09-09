import { readImportFile } from "../shared/read-import-file";
import { parseProspectsCsv, type CsvParseResult } from "./csv";

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
  const { text, structured } = await readImportFile(file);
  if (!structured) return { rows: [], errors: [], rawTextForAi: text || undefined };

  const result = parseProspectsCsv(text);
  if (result.rows.length > 0) return result;
  return { rows: [], errors: result.errors, rawTextForAi: text || undefined };
}
