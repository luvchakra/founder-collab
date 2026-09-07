import { GST_RATE_SLABS } from "@cofounderai/core/lib/gst";
import type { ProductInput } from "./mutations";

export type CsvParseResult = {
  rows: ProductInput[];
  errors: string[];
};

/** Minimal CSV line parser: handles quoted fields with embedded commas/quotes. Mirrors
 * module-discovery's prospects/csv.ts parser -- same paste-CSV shape, different columns. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

const NUMERIC_FIELDS = [
  "tax_rate",
  "cost_price",
  "selling_price",
  "reorder_point",
  "reorder_quantity",
] as const;

/**
 * Parses a pasted CSV into product inputs. Required columns: sku, name. Optional: brand,
 * category, supplier, unit, hsn_code, tax_rate, cost_price, selling_price, reorder_point,
 * reorder_quantity, barcode, description. `supplier` is resolved against
 * `supplierIdByNameLower` (built by the caller from the business's own supplier list,
 * since this parser has no DB access) -- an unmatched name is left unset rather than
 * failing the row. Rows missing sku/name, or with an invalid GST rate / negative number,
 * are skipped (reported in `errors`) rather than failing the whole import.
 */
export function parseProductsCsv(
  text: string,
  supplierIdByNameLower: Map<string, string>,
): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], errors: ["No content to import."] };
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const skuIndex = header.indexOf("sku");
  const nameIndex = header.indexOf("name");
  if (skuIndex === -1 || nameIndex === -1) {
    return { rows: [], errors: ["Missing required column(s): sku, name"] };
  }

  const columnIndex = (name: string) => header.indexOf(name);
  const get = (fields: string[], name: string) => {
    const idx = columnIndex(name);
    return idx === -1 ? undefined : fields[idx]?.trim() || undefined;
  };

  const rows: ProductInput[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const sku = fields[skuIndex]?.trim();
    const name = fields[nameIndex]?.trim();
    if (!sku || !name) {
      errors.push(`Row ${i + 1}: missing sku or name, skipped.`);
      continue;
    }

    const rowErrors: string[] = [];
    for (const field of NUMERIC_FIELDS) {
      const raw = get(fields, field);
      if (raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) rowErrors.push(`invalid ${field} "${raw}"`);
    }
    const taxRateRaw = get(fields, "tax_rate");
    if (taxRateRaw !== undefined) {
      const rate = Number(taxRateRaw);
      if (!(GST_RATE_SLABS as readonly number[]).includes(rate)) {
        rowErrors.push(`GST rate "${taxRateRaw}" must be one of ${GST_RATE_SLABS.join(", ")}`);
      }
    }
    if (rowErrors.length > 0) {
      errors.push(`Row ${i + 1} (${sku}): ${rowErrors.join("; ")}, skipped.`);
      continue;
    }

    const supplierName = get(fields, "supplier")?.toLowerCase();
    const costPriceRaw = get(fields, "cost_price");
    const sellingPriceRaw = get(fields, "selling_price");
    const reorderPointRaw = get(fields, "reorder_point");
    const reorderQuantityRaw = get(fields, "reorder_quantity");

    rows.push({
      sku,
      name,
      brand: get(fields, "brand") ?? null,
      barcode: get(fields, "barcode") ?? null,
      description: get(fields, "description") ?? null,
      categoryName: get(fields, "category") ?? null,
      supplier_id: (supplierName && supplierIdByNameLower.get(supplierName)) || null,
      unit: get(fields, "unit") ?? "pcs",
      hsn_code: get(fields, "hsn_code") ?? null,
      tax_rate: taxRateRaw !== undefined ? Number(taxRateRaw) : 18,
      cost_price: costPriceRaw !== undefined ? Number(costPriceRaw) : 0,
      selling_price: sellingPriceRaw !== undefined ? Number(sellingPriceRaw) : 0,
      reorder_point: reorderPointRaw !== undefined ? Number(reorderPointRaw) : 0,
      reorder_quantity: reorderQuantityRaw !== undefined ? Number(reorderQuantityRaw) : 0,
    });
  }

  return { rows, errors };
}
