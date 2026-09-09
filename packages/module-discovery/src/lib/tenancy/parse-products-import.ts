import { parseCsvLine } from "../shared/parse-csv-line";
import { readImportFile } from "../shared/read-import-file";

export type ProductImportRow = { name: string; description?: string; website?: string };
export type ProductImportParseResult = {
  rows: ProductImportRow[];
  errors: string[];
  /** True when the file didn't match the preferred `name,description,website` template
   * and this fell back to fuzzy header aliasing (CSV/Excel) or a one-name-per-line
   * heuristic (PDF) instead -- shown in the preview so the founder knows to double-check
   * the result rather than assuming an exact template match. */
  usedFallback: boolean;
};

/** The business page's own preview-step action result -- defined here (not in
 * apps/web) so the client wizard component in this package can type its `previewAction`
 * prop against it without importing anything from apps/web (packages never import an
 * app, only the reverse). */
export type ProductImportPreviewResult = { error: string } | ProductImportParseResult;

const MAX_ROWS = 500;

/** Column names accepted for each field, beyond the preferred literal ones -- covers
 * the common variants a real catalog export (Shopify, a spreadsheet someone built by
 * hand, etc.) is likely to already use, so a founder isn't forced to rename columns
 * just to match this platform's own template. */
const HEADER_ALIASES: Record<keyof ProductImportRow, string[]> = {
  name: ["name", "product_name", "product", "title", "item_name", "item"],
  description: ["description", "desc", "details", "summary"],
  website: ["website", "url", "link", "site", "product_url"],
};

function findColumn(header: string[], field: keyof ProductImportRow): number {
  for (const alias of HEADER_ALIASES[field]) {
    const idx = header.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseProductsCsv(text: string): { rows: ProductImportRow[]; errors: string[]; usedFallback: boolean } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: ["No content to import."], usedFallback: false };

  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const nameIndex = findColumn(header, "name");
  if (nameIndex === -1) return { rows: [], errors: ["No recognizable product-name column."], usedFallback: false };

  const descIndex = findColumn(header, "description");
  const websiteIndex = findColumn(header, "website");
  const usedFallback = header[nameIndex] !== "name" || (descIndex !== -1 && header[descIndex] !== "description");

  const rows: ProductImportRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length && rows.length < MAX_ROWS; i++) {
    const fields = parseCsvLine(lines[i]!);
    const name = fields[nameIndex]?.trim();
    if (!name) {
      errors.push(`Row ${i + 1}: missing product name, skipped.`);
      continue;
    }
    rows.push({
      name,
      description: descIndex !== -1 ? fields[descIndex]?.trim() || undefined : undefined,
      website: websiteIndex !== -1 ? fields[websiteIndex]?.trim() || undefined : undefined,
    });
  }
  return { rows, errors, usedFallback };
}

/** A PDF (or any file whose CSV parse found nothing usable) has no columns to
 * deterministically map at all -- the best a non-AI fallback can do is treat each
 * substantial line as one product name. Filters out obvious noise (blank lines, page
 * numbers, one-or-two-character fragments, lines that read like running prose rather
 * than a catalog entry) rather than importing every line verbatim; the preview step is
 * what catches whatever this still gets wrong. No description/website -- there's no
 * structure here to attribute them to a specific product from. */
function parseUnstructuredLines(text: string): ProductImportRow[] {
  const seen = new Set<string>();
  const rows: ProductImportRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-•*\d.)\s]+/, "").trim();
    if (line.length < 3 || line.length > 120) continue;
    if (/[.!?]\s+\w/.test(line)) continue; // reads like a sentence, not a catalog entry
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name: line });
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

/**
 * Parses an uploaded product-catalog file (CSV, Excel .xlsx, or PDF) into product rows.
 * CSV/Excel try the preferred `name,description,website` template first, then fuzzy
 * header aliases; a PDF (or a CSV/Excel with no recognizable name column at all) falls
 * back to a one-product-per-line heuristic. Deliberately not AI-restructured like the
 * prospects import is: that path bills against a workspace's own connected AI provider
 * (`ai_runs.workspace_id` is `not null`), and bulk-creating products from the business
 * page runs before any product/workspace exists to bill against -- the heuristic
 * fallback plus the caller's own preview step (showing the first few rows before
 * anything is actually created) is the honest alternative rather than inventing a
 * workspace to attribute the AI call to.
 */
export async function parseProductImportFile(file: File): Promise<ProductImportParseResult> {
  const { text, structured } = await readImportFile(file);
  if (!structured) return { rows: parseUnstructuredLines(text), errors: [], usedFallback: true };

  const result = parseProductsCsv(text);
  if (result.rows.length > 0) return result;
  return { rows: parseUnstructuredLines(text), errors: result.errors, usedFallback: true };
}
