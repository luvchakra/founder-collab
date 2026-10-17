import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { getActivationSettings } from "../activation/queries";
import { monthlyPeriodsForFiscalYear } from "./periods";
import { BUDGETABLE_ACCOUNT_TYPES, diffBudget, parseBudgetEntry } from "./budget-entry";
import type { AccountType } from "./types";

/** `gst.accounts.write` is the permission `gst.budget_lines`' own RLS policies check
 * (20260918110000_gst_budgets.sql) — Owner, Admin, Accountant and Finance Manager hold it.
 * Checking a different key here than the database does would let the two disagree. */
export const BUDGET_PERMISSION = "gst.accounts.write";

export type SaveBudgetResult =
  | { ok: true; changed: number }
  | { ok: false; error: string };

/**
 * FIN-BUDGET-ENTRY — saves one fiscal year's budget grid.
 *
 * Writes only the cells that changed: new or edited figures are upserted on the table's
 * own (business, account, month) key, and a cleared cell removes that month's line. One
 * audit entry records the save, with how many figures changed — not the figures
 * themselves, which the table already holds.
 */
export async function saveBudget(businessId: string, raw: unknown): Promise<SaveBudgetResult> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, BUDGET_PERMISSION);

  const { fiscalYearStartMonth } = await getActivationSettings(businessId);
  const parsed = parseBudgetEntry(raw, fiscalYearStartMonth);
  if (!parsed.ok) return parsed;
  const { fiscalYear, lines } = parsed.value;

  const supabase = await createClient();

  // Every account must be one of this business's income, cost or expense accounts. RLS
  // and the table's trigger refuse another business's account anyway; checking first
  // gives a sentence instead of a policy error.
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  if (accountIds.length > 0) {
    const { data: accounts, error } = await supabase
      .from("accounts")
      .select("id, type")
      .eq("business_id", businessId)
      .in("id", accountIds);
    if (error) throw error;
    const typeById = new Map(((accounts ?? []) as { id: string; type: AccountType }[]).map((a) => [a.id, a.type]));
    for (const id of accountIds) {
      const type = typeById.get(id);
      if (!type) return { ok: false, error: "One of the accounts isn't in this business's chart of accounts." };
      if (!BUDGETABLE_ACCOUNT_TYPES.includes(type)) {
        return { ok: false, error: "Budgets are set against income, cost of sales and expense accounts only." };
      }
    }
  }

  const year = monthlyPeriodsForFiscalYear(fiscalYear, fiscalYearStartMonth);
  const { data: stored, error: storedError } = await supabase
    .from("budget_lines")
    .select("account_id, period_start, amount")
    .eq("business_id", businessId)
    .gte("period_start", year[0]!.startDate)
    .lte("period_start", year[year.length - 1]!.startDate);
  if (storedError) throw storedError;

  const changes = diffBudget(
    ((stored ?? []) as { account_id: string; period_start: string; amount: number | string }[]).map((r) => ({
      accountId: r.account_id,
      periodStart: r.period_start,
      amount: Number(r.amount),
    })),
    lines,
  );
  const changed = changes.upserts.length + changes.deletes.length;
  if (changed === 0) return { ok: true, changed: 0 };

  if (changes.upserts.length > 0) {
    const { error } = await supabase.from("budget_lines").upsert(
      changes.upserts.map((u) => ({
        business_id: businessId,
        account_id: u.accountId,
        period_start: u.periodStart,
        amount: u.amount,
      })),
      { onConflict: "business_id,account_id,period_start" },
    );
    if (error) throw error;
  }

  for (const d of changes.deletes) {
    const { error } = await supabase
      .from("budget_lines")
      .delete()
      .eq("business_id", businessId)
      .eq("account_id", d.accountId)
      .eq("period_start", d.periodStart);
    if (error) throw error;
  }

  const {
    data: { user },
  } = await (await createCoreClient({ schema: "core" })).auth.getUser();
  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "gst_budget.saved",
    entityType: "gst_budget",
    after: { fiscalYear, figuresSet: changes.upserts.length, figuresCleared: changes.deletes.length },
  });

  return { ok: true, changed };
}
