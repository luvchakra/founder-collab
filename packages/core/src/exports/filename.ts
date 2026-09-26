import { BRAND_NAME } from "../lib/brand";
import { toDateOnly } from "./format";
import type { ExportFormat } from "./types";

/**
 * `wonderark_<module>_<resource>_<yyyy-mm-dd>.<ext>` (§13) -- e.g.
 * `wonderark_crm_leads_2026-09-26.csv`. Every part is slugged from values the adapter
 * owns (module and resource keys), never from anything a user typed into a filter, so a
 * filename can't carry arbitrary text. The date is the business's local date.
 */
export function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "export";
}

export function exportFilename(
  module: string,
  resource: string,
  format: ExportFormat,
  generatedAt: Date,
  timeZone: string,
): string {
  const date = toDateOnly(generatedAt, timeZone) ?? generatedAt.toISOString().slice(0, 10);
  return `${slugPart(BRAND_NAME).replace(/-/g, "")}_${slugPart(module)}_${slugPart(resource)}_${date}.${format}`;
}
