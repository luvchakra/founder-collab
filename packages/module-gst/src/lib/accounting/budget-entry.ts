import { z } from "zod";
import { monthlyPeriodsForFiscalYear } from "./periods";
import type { AccountType } from "./types";

/**
 * FIN-BUDGET-ENTRY — entering budget figures: one amount per trading account per month of
 * a fiscal year, saved together.
 *
 * Pure: the validation and the "what actually changed" diff live here so they are tested
 * without a database; `budget-mutations.ts` only fetches, writes and audits.
 */

/** The accounts a budget is set against — the same three `getBudgetVsActual()` reports
 * on. A budget against a bank balance is a cash-flow forecast, a different report. */
export const BUDGETABLE_ACCOUNT_TYPES: AccountType[] = ["income", "cogs", "expense"];

/** numeric(18, 2): sixteen digits before the point. */
const MAX_AMOUNT = 9_999_999_999_999_999;

const isoMonthStart = /^\d{4}-(0[1-9]|1[0-2])-01$/;

export const budgetEntrySchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2100),
  lines: z
    .array(
      z.object({
        accountId: z.uuid(),
        periodStart: z.string().regex(isoMonthStart, "Each figure needs the first day of its month."),
        // null clears the month: no budget, rather than a budget of zero.
        amount: z
          .number()
          .finite("Amounts have to be numbers.")
          .refine((n) => Math.abs(n) <= MAX_AMOUNT, "That amount is too large.")
          .nullable(),
      }),
    )
    .max(12 * 500, "Too many figures in one save."),
});

export type BudgetEntryInput = z.infer<typeof budgetEntrySchema>;
export type BudgetEntryLine = BudgetEntryInput["lines"][number];

export type ParseBudgetEntryResult = { ok: true; value: BudgetEntryInput } | { ok: false; error: string };

/** Validates a submitted grid against the shape, then against the fiscal year it claims
 * to be for: a month outside that year, or the same cell twice, is refused rather than
 * silently written into some other year's budget. */
export function parseBudgetEntry(raw: unknown, fiscalYearStartMonth: number): ParseBudgetEntryResult {
  const parsed = budgetEntrySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the figures and try again." };

  const months = new Set(monthlyPeriodsForFiscalYear(parsed.data.fiscalYear, fiscalYearStartMonth).map((p) => p.startDate));
  const seen = new Set<string>();
  for (const line of parsed.data.lines) {
    if (!months.has(line.periodStart)) return { ok: false, error: "A figure falls outside the fiscal year being saved." };
    const key = `${line.accountId}|${line.periodStart}`;
    if (seen.has(key)) return { ok: false, error: "The same month was entered twice for one account." };
    seen.add(key);
  }

  return {
    ok: true,
    value: {
      fiscalYear: parsed.data.fiscalYear,
      lines: parsed.data.lines.map((l) => ({ ...l, amount: l.amount === null ? null : Math.round(l.amount * 100) / 100 })),
    },
  };
}

/** A typed cell to an amount: blank means "no budget", anything else must be a number.
 * Commas are accepted as thousands separators ("1,20,000" and "120,000" both read). */
export function parseAmountCell(value: string): number | null | "invalid" {
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : "invalid";
}

export interface ExistingBudgetLine {
  accountId: string;
  periodStart: string;
  amount: number;
}

export interface BudgetChanges {
  upserts: { accountId: string; periodStart: string; amount: number }[];
  deletes: { accountId: string; periodStart: string }[];
}

/** Only what differs from what is stored: a cell left alone is not rewritten, so saving
 * an unchanged grid writes nothing and the audit entry counts real changes. */
export function diffBudget(existing: ExistingBudgetLine[], submitted: BudgetEntryLine[]): BudgetChanges {
  const stored = new Map(existing.map((l) => [`${l.accountId}|${l.periodStart}`, Number(l.amount)]));
  const changes: BudgetChanges = { upserts: [], deletes: [] };

  for (const line of submitted) {
    const key = `${line.accountId}|${line.periodStart}`;
    const current = stored.get(key);
    if (line.amount === null) {
      if (current !== undefined) changes.deletes.push({ accountId: line.accountId, periodStart: line.periodStart });
    } else if (current === undefined || Math.round(current * 100) !== Math.round(line.amount * 100)) {
      changes.upserts.push({ accountId: line.accountId, periodStart: line.periodStart, amount: line.amount });
    }
  }
  return changes;
}
