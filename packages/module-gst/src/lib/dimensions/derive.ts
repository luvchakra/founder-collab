import type { AccountType } from "../accounting/types";

/**
 * FIN-9 — dimensions (§29): reporting the ledger by party, item, location or project.
 *
 * The four dimensions are the optional columns `gst.journal_lines` has always carried; a
 * business switches on the ones it uses and names them its own way. Never mandatory: an
 * untagged line is valid and reports as "Unassigned", so the report always adds up to the
 * whole ledger. Pure, so the arithmetic can be tested without a database.
 */

export type DimensionKey = "party" | "item" | "location" | "project";

export const DIMENSION_KEYS: DimensionKey[] = ["party", "item", "location", "project"];

export const DEFAULT_DIMENSION_LABEL: Record<DimensionKey, string> = {
  party: "Customer / supplier",
  item: "Product / service",
  location: "Location",
  project: "Project",
};

export const DIMENSION_HELP: Record<DimensionKey, string> = {
  party: "Filled in automatically from every invoice, bill and payment — no typing needed.",
  item: "For lines that name a product or service.",
  location: "A branch, store or site, typed on manual journal entries.",
  project: "A job, project or cost centre, typed on manual journal entries.",
};

export function isDimensionKey(value: string): value is DimensionKey {
  return (DIMENSION_KEYS as string[]).includes(value);
}

export interface DimensionSetting {
  key: DimensionKey;
  enabled: boolean;
  label: string;
}

/** Stored rows over defaults: a dimension never configured is off, with its default name. */
export function resolveDimensionSettings(rows: { dimension_key: string; enabled: boolean; label: string | null }[]): DimensionSetting[] {
  const byKey = new Map(rows.map((r) => [r.dimension_key, r]));
  return DIMENSION_KEYS.map((key) => {
    const row = byKey.get(key);
    return { key, enabled: row?.enabled ?? false, label: row?.label?.trim() || DEFAULT_DIMENSION_LABEL[key] };
  });
}

export interface DimensionTotalRow {
  value: string | null;
  accountType: AccountType;
  debit: number;
  credit: number;
}

export interface DimensionReportRow {
  /** The raw value (a party/item id, or the typed text); null for untagged lines. */
  value: string | null;
  name: string;
  income: number;
  /** Cost of sales and expenses together: what it cost. */
  costs: number;
  profit: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Income, costs and profit per dimension value. Balance-sheet lines (a receivable, the
 * bank) carry a party too, but "profit by customer" is a profit and loss question, so only
 * income, COGS and expense accounts count here. Sorted by income, largest first, with
 * "Unassigned" last whatever its size.
 */
export function summariseByDimension(rows: DimensionTotalRow[], names: Map<string, string>): DimensionReportRow[] {
  const byValue = new Map<string | null, { income: number; costs: number }>();
  for (const row of rows) {
    if (!["income", "cogs", "expense"].includes(row.accountType)) continue;
    const current = byValue.get(row.value) ?? { income: 0, costs: 0 };
    if (row.accountType === "income") current.income += row.credit - row.debit;
    else current.costs += row.debit - row.credit;
    byValue.set(row.value, current);
  }

  return [...byValue.entries()]
    .map(([value, t]) => ({
      value,
      name: value === null ? "Unassigned" : (names.get(value) ?? value),
      income: round2(t.income),
      costs: round2(t.costs),
      profit: round2(t.income - t.costs),
    }))
    .filter((r) => r.income !== 0 || r.costs !== 0)
    .sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : b.income - a.income || a.name.localeCompare(b.name)));
}
