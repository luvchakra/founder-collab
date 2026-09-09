import { parseCsvLine } from "../shared/parse-csv-line";
import type { ProspectInput } from "./mutations";

export type CsvParseResult = {
  rows: ProspectInput[];
  errors: string[];
};

/**
 * Parses a pasted CSV into prospect inputs. Required column: company_name. Optional:
 * website, industry, company_size, location, description. Rows missing company_name are
 * skipped (reported in `errors`) rather than failing the whole import.
 */
export function parseProspectsCsv(text: string): CsvParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], errors: ["No content to import."] };
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const companyNameIndex = header.indexOf("company_name");
  if (companyNameIndex === -1) {
    return { rows: [], errors: ["Missing required column: company_name"] };
  }

  const columnIndex = (name: string) => header.indexOf(name);
  const get = (fields: string[], name: string) => {
    const idx = columnIndex(name);
    return idx === -1 ? undefined : fields[idx]?.trim() || undefined;
  };

  const rows: ProspectInput[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const companyName = fields[companyNameIndex]?.trim();
    if (!companyName) {
      errors.push(`Row ${i + 1}: missing company_name, skipped.`);
      continue;
    }

    rows.push({
      companyName,
      website: get(fields, "website"),
      industry: get(fields, "industry"),
      companySize: get(fields, "company_size"),
      location: get(fields, "location"),
      description: get(fields, "description"),
    });
  }

  return { rows, errors };
}
