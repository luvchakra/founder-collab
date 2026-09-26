import type { ExportColumn } from "@cofounderai/core/exports/types";
import type { CampaignTotals, Metric } from "../../lib/marketing/metrics";
import type { MetricSource } from "../../lib/marketing/types";

/**
 * EXP-MKT-01..07 -- what every Marketing export shares: the page filters they read the
 * same way the pages do, and the metric columns. The rule every column here keeps
 * (docs/plan/13-DATA-EXPORT-BACKLOG.md §46, data-exports.md rule 8): a figure nobody
 * reported stays blank. `campaignTotals` already returns null for it; nothing below
 * turns that null into a zero.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id-valued filter (offering, campaign) -- only ever a selection criterion that is
 * then applied *together with* the business filter, so a foreign id matches nothing.
 * Anything that isn't a UUID is ignored rather than sent to the database. */
export function idParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value && UUID.test(value) ? value : undefined;
}

export const METRIC_SOURCE_LABEL: Record<MetricSource, string> = {
  manual: "Manual",
  import: "Import",
  website: "Website",
  provider: "Provider",
  computed: "Computed",
};

/** The currency a set of totals is in: the one currency its snapshots used, "Mixed" when
 * they used several (money totals are then blank, exactly as on screen), else the
 * campaign's own currency. */
export function totalsCurrency(totals: CampaignTotals, fallback: string | null): string | null {
  if (totals.currencies.length > 1) return `Mixed (${totals.currencies.join(", ")})`;
  return totals.currencies[0] ?? fallback;
}

type TotalsKey = Exclude<keyof CampaignTotals, "currencies">;

const COUNT_FIELDS: { key: TotalsKey; header: string }[] = [
  { key: "impressions", header: "Impressions" },
  { key: "clicks", header: "Clicks" },
  { key: "sessions", header: "Sessions" },
  { key: "leads", header: "Leads" },
  { key: "qualifiedLeads", header: "Qualified leads" },
  { key: "opportunities", header: "Opportunities" },
  { key: "customers", header: "Customers" },
];

/**
 * The metric columns of a report row, reading its totals through `pick`. Money is a
 * `currency` column with the currency in its own column (rows can differ, §41); the
 * lead-to-customer rate is a fraction (§42). Unreported -> null -> blank cell.
 */
export function totalsColumns<T>(
  pick: (row: T) => CampaignTotals,
  options: { fields?: TotalsKey[]; fallbackCurrency?: (row: T) => string | null } = {},
): ExportColumn<T>[] {
  const wanted = new Set<TotalsKey>(
    options.fields ?? ["spend", "impressions", "clicks", "sessions", "leads", "qualifiedLeads", "opportunities", "customers", "revenue", "costPerLead", "costPerQualifiedLead", "costPerOpportunity", "leadToCustomer"],
  );
  const value = (key: TotalsKey) => (row: T) => (pick(row)[key] as Metric).value;
  const columns: ExportColumn<T>[] = [];
  if (wanted.has("spend")) columns.push({ key: "spend", header: "Spend", type: "currency", getValue: value("spend") });
  for (const f of COUNT_FIELDS) {
    if (wanted.has(f.key)) columns.push({ key: f.key, header: f.header, type: "integer", getValue: value(f.key) });
  }
  if (wanted.has("revenue")) columns.push({ key: "revenue", header: "Revenue", type: "currency", getValue: value("revenue") });
  if (wanted.has("costPerLead")) columns.push({ key: "cpl", header: "Cost per lead", type: "currency", getValue: value("costPerLead") });
  if (wanted.has("costPerQualifiedLead"))
    columns.push({ key: "cpql", header: "Cost per qualified lead", type: "currency", getValue: value("costPerQualifiedLead") });
  if (wanted.has("costPerOpportunity"))
    columns.push({ key: "cpo", header: "Cost per opportunity", type: "currency", getValue: value("costPerOpportunity") });
  if (wanted.has("leadToCustomer"))
    columns.push({ key: "leadToCustomer", header: "Lead to customer", type: "percent", getValue: value("leadToCustomer") });
  columns.push({
    key: "currency",
    header: "Currency",
    getValue: (row) => totalsCurrency(pick(row), options.fallbackCurrency?.(row) ?? null),
  });
  return columns;
}

/** One row of a "figures" sheet (dashboard Summary, campaign Results): what the tile
 * says, its unit, and the definition the page shows behind "How calculated". */
export type FigureRow = {
  label: string;
  value: number | null;
  unit: "Count" | "Money" | "Rate";
  currency: string | null;
  definition: string;
};

export function figureRow(label: string, metric: Metric, unit: FigureRow["unit"], currency: string | null = null): FigureRow {
  return { label, value: metric.value, unit, currency: unit === "Money" ? currency : null, definition: metric.definition };
}

export const FIGURE_COLUMNS: ExportColumn<FigureRow>[] = [
  { key: "metric", header: "Metric", getValue: (r) => r.label },
  { key: "value", header: "Value", type: "number", getValue: (r) => r.value },
  { key: "unit", header: "Unit", getValue: (r) => (r.unit === "Rate" ? "Rate (fraction, 0.25 = 25%)" : r.unit) },
  { key: "currency", header: "Currency", getValue: (r) => r.currency },
  { key: "reported", header: "Reported", type: "boolean", getValue: (r) => r.value !== null },
  { key: "definition", header: "How calculated", getValue: (r) => r.definition },
];

/** The dashboard/campaign figures for a set of totals, labelled as on screen. */
export function totalsFigures(totals: CampaignTotals, currency: string | null): FigureRow[] {
  return [
    figureRow("Leads", totals.leads, "Count"),
    figureRow("Qualified leads", totals.qualifiedLeads, "Count"),
    figureRow("Opportunities", totals.opportunities, "Count"),
    figureRow("Customers", totals.customers, "Count"),
    figureRow("Spend", totals.spend, "Money", currency),
    figureRow("Cost per lead", totals.costPerLead, "Money", currency),
    figureRow("Cost per qualified lead", totals.costPerQualifiedLead, "Money", currency),
    figureRow("Cost per opportunity", totals.costPerOpportunity, "Money", currency),
    figureRow("Lead to customer", totals.leadToCustomer, "Rate"),
    figureRow("Revenue", totals.revenue, "Money", currency),
  ];
}
