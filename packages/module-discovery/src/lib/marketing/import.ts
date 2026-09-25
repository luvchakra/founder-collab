import { parseCsvLine } from "../shared/parse-csv-line";
import { firstIssue, metricSnapshotSchema, type MetricSnapshotInput } from "./schemas";

/**
 * MKT-06 — importing campaign results from a CSV export (§45: "campaign metrics CSV"),
 * the provider adapter available before any ad-platform integration exists. Each row goes
 * through the same schema as a hand-entered snapshot, tagged `import` so it stays
 * distinguishable; a blank cell is "not reported", never 0. Rows that fail are reported by
 * line and nothing is guessed.
 */

export const MAX_IMPORT_ROWS = 1000;

const HEADER_ALIASES: Record<string, keyof MetricSnapshotInput> = {
  date: "metricDate",
  metric_date: "metricDate",
  day: "metricDate",
  impressions: "impressions",
  clicks: "clicks",
  sessions: "sessions",
  visits: "sessions",
  engagements: "engagements",
  leads: "leads",
  qualified_leads: "qualifiedLeads",
  qualified: "qualifiedLeads",
  opportunities: "opportunities",
  customers: "customers",
  revenue: "revenue",
  spend: "spend",
  cost: "spend",
  currency: "currency",
};

export function parseMetricsCsv(text: string): { rows: MetricSnapshotInput[]; errors: string[] } {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["The file needs a header row and at least one row of numbers."] };

  const header = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const fields = header.map((h) => HEADER_ALIASES[h] ?? null);
  if (!fields.includes("metricDate")) return { rows: [], errors: ['The header must include a "date" column.'] };
  if (lines.length - 1 > MAX_IMPORT_ROWS) return { rows: [], errors: [`Import at most ${MAX_IMPORT_ROWS} rows at a time.`] };

  const rows: MetricSnapshotInput[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const cells = parseCsvLine(line);
    const raw: Record<string, string> = { source: "import" };
    fields.forEach((field, c) => {
      if (field) raw[field] = (cells[c] ?? "").trim();
    });
    const parsed = metricSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Line ${i + 2}: ${firstIssue(parsed.error)}`);
      return;
    }
    if (seen.has(parsed.data.metricDate)) {
      errors.push(`Line ${i + 2}: ${parsed.data.metricDate} appears more than once.`);
      return;
    }
    seen.add(parsed.data.metricDate);
    rows.push(parsed.data);
  });
  return { rows, errors };
}
