import type { ExportSheet } from "@cofounderai/core/exports/types";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";

/**
 * EXP-INV-01..12 -- what every Inventory export shares: the licence/permission pair,
 * the cost-visibility check, enum labels, and the INR money column.
 */

export const INVENTORY_EXPORT_PERMISSIONS = ["inventory.view"] as const;

/** Cost price, margin, landed and supplier cost only ever leave with this permission
 * (§18); without it the columns are dropped, not blanked. */
export function canViewCost(businessId: string): Promise<boolean> {
  return hasPermission(businessId, "inventory.view_cost");
}

/** `partially_received` -> `Partially received`, the way the list pages render codes.
 * Blank stays blank. */
export function humanize(code: string | null | undefined): string {
  if (!code) return "";
  const text = code.replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A status from a module's own `STAGES` list, falling back to the humanized code for
 * statuses a pipeline doesn't list (cancelled, returned...). */
export function stageLabel(stages: readonly { key: string; label: string }[], code: string): string {
  return stages.find((s) => s.key === code)?.label ?? humanize(code);
}

/** Tax rates are stored as whole percents (18 = 18%); exports carry fractions (§42). */
export function percentFraction(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n / 100 : null;
}

export function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Inventory is single-currency (every page formats with INR). */
export function money<T>(key: string, header: string, getValue: (row: T) => unknown) {
  return { key, header, type: "currency" as const, currency: "INR", getValue };
}

/** A metric row for dashboard sheets: a quantity or an INR amount, never both; a figure
 * that doesn't apply stays blank. */
export type MetricRow = { metric: string; quantity?: number | null; amount?: number | null; note?: string };

export function metricSheet(sheetName: string, rows: MetricRow[]): ExportSheet<MetricRow> {
  return {
    sheetName,
    columns: [
      { key: "metric", header: "Metric", getValue: (r) => r.metric },
      { key: "quantity", header: "Quantity", type: "number", getValue: (r) => r.quantity ?? null },
      money<MetricRow>("amount", "Amount", (r) => r.amount ?? null),
      { key: "note", header: "Note", getValue: (r) => r.note ?? "" },
    ],
    rows,
  };
}
