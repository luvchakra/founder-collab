import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  explainPeriodTransition,
  monthlyPeriodsForFiscalYear,
  type PeriodStatus,
} from "./periods";
import { planProvisioning } from "./provisioning";
import type { AccountRoleKey, AccountType } from "./types";

/**
 * Gives a business the default Chart of Accounts, and points each posting role at the
 * account it should resolve to. Safe to re-run: `planProvisioning` works out what is
 * actually missing (see its own docstring for why that, and not a provisioned flag).
 *
 * Runs as the signed-in user, so RLS (`tenant AND licensed`, plus `gst.accounts.write`)
 * is what actually authorises the writes; the two guards below fail earlier with a
 * readable message instead of an opaque policy violation.
 */
export async function provisionChartOfAccounts(
  businessId: string,
): Promise<{ accountsCreated: number; rolesMapped: number }> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.accounts.write");

  const supabase = await createClient();
  const [{ data: existing, error: existingError }, { data: mappings, error: mappingError }] =
    await Promise.all([
      supabase.from("accounts").select("id, account_number").eq("business_id", businessId),
      supabase.from("account_mappings").select("role_key").eq("business_id", businessId),
    ]);
  if (existingError) throw existingError;
  if (mappingError) throw mappingError;

  const idByNumber = new Map<string, string>(
    (existing ?? []).map((row: { id: string; account_number: string }) => [row.account_number, row.id]),
  );
  const plan = planProvisioning(
    idByNumber.keys(),
    (mappings ?? []).map((row: { role_key: string }) => row.role_key),
  );

  let accountsCreated = 0;
  for (const batch of plan.batches) {
    const { data: inserted, error } = await supabase
      .from("accounts")
      .insert(
        batch.map((seed) => ({
          business_id: businessId,
          account_number: seed.accountNumber,
          name: seed.name,
          type: seed.type,
          parent_account_id: seed.parent ? (idByNumber.get(seed.parent) ?? null) : null,
          is_system: seed.isSystem,
        })),
      )
      .select("id, account_number");
    if (error) throw error;

    for (const row of (inserted ?? []) as { id: string; account_number: string }[]) {
      idByNumber.set(row.account_number, row.id);
      accountsCreated += 1;
    }
  }

  // A role whose account somehow isn't there is dropped rather than failing the whole
  // run -- every other mapping is still worth having, and the chart's own test is what
  // guarantees the default set resolves.
  const newMappings = plan.roleMappings
    .map((m) => ({ role: m.role, accountId: idByNumber.get(m.accountNumber) }))
    .filter((m): m is { role: AccountRoleKey; accountId: string } => Boolean(m.accountId));

  if (newMappings.length > 0) {
    const { error } = await supabase.from("account_mappings").insert(
      newMappings.map((m) => ({ business_id: businessId, role_key: m.role, account_id: m.accountId })),
    );
    if (error) throw error;
  }

  return { accountsCreated, rolesMapped: newMappings.length };
}

export interface AccountInput {
  accountNumber: string;
  name: string;
  type: AccountType;
  subtype?: string | null;
  parentAccountId?: string | null;
  openingBalance?: number;
}

/** Adds one account a business needs beyond the default chart. Never `is_system`: only
 * the posting engine's own accounts are system accounts, and those arrive with the
 * default chart. */
export async function createAccount(businessId: string, input: AccountInput): Promise<string> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.accounts.write");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      business_id: businessId,
      account_number: input.accountNumber.trim(),
      name: input.name.trim(),
      type: input.type,
      subtype: input.subtype?.trim() || null,
      parent_account_id: input.parentAccountId || null,
      opening_balance: input.openingBalance ?? 0,
      is_system: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Renames an account, or deactivates one that is no longer used.
 *
 * A system account can be renamed but never deactivated -- the posting engine resolves it
 * by role, so hiding it would leave automatic entries with no target. The database has no
 * way to know that intent, so the rule is stated here, where the message can say why.
 */
export async function updateAccount(
  businessId: string,
  accountId: string,
  changes: { name?: string; subtype?: string | null; isActive?: boolean },
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.accounts.write");

  const supabase = await createClient();
  const { data: account, error: readError } = await supabase
    .from("accounts")
    .select("is_system")
    .eq("business_id", businessId)
    .eq("id", accountId)
    .single();
  if (readError) throw readError;

  if (changes.isActive === false && (account as { is_system: boolean }).is_system) {
    throw new Error(
      "This is a system account — automatic postings resolve to it, so it can be renamed but not deactivated.",
    );
  }

  const patch: Record<string, unknown> = {};
  if (changes.name !== undefined) patch.name = changes.name.trim();
  if (changes.subtype !== undefined) patch.subtype = changes.subtype?.trim() || null;
  if (changes.isActive !== undefined) patch.is_active = changes.isActive;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("accounts").update(patch).eq("business_id", businessId).eq("id", accountId);
  if (error) throw error;
}

/**
 * Opens a fiscal year's twelve monthly periods.
 *
 * Idempotent the same way provisioning is: periods that already exist are left exactly
 * as they are, statuses included, so re-opening a year that is half closed doesn't
 * quietly reopen the months already filed. The table's own
 * `unique (business_id, start_date, end_date)` is the real guarantee.
 */
export async function openFiscalYear(
  businessId: string,
  fiscalYear: number,
  fiscalYearStartMonth = 4,
): Promise<{ periodsCreated: number }> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.periods.manage");

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("accounting_periods")
    .select("start_date")
    .eq("business_id", businessId)
    .eq("fiscal_year", fiscalYear);
  if (readError) throw readError;

  const have = new Set((existing ?? []).map((row: { start_date: string }) => row.start_date));
  const missing = monthlyPeriodsForFiscalYear(fiscalYear, fiscalYearStartMonth).filter(
    (period) => !have.has(period.startDate),
  );
  if (missing.length === 0) return { periodsCreated: 0 };

  const { error } = await supabase.from("accounting_periods").insert(
    missing.map((period) => ({
      business_id: businessId,
      fiscal_year: period.fiscalYear,
      start_date: period.startDate,
      end_date: period.endDate,
      gst_period: period.gstPeriod,
      status: "open",
    })),
  );
  if (error) throw error;
  return { periodsCreated: missing.length };
}

/**
 * Moves a period through the close.
 *
 * The transition rules live in `periods.ts` and are checked here so the refusal can say
 * why in words a user can act on. The database enforces the consequence that actually
 * matters — a locked, filed or closed period takes no postings — via its own trigger, so
 * this is the readable half of the same rule, not the only half.
 */
export async function setAccountingPeriodStatus(
  businessId: string,
  periodId: string,
  status: PeriodStatus,
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.periods.manage");

  const supabase = await createClient();
  const { data: period, error: readError } = await supabase
    .from("accounting_periods")
    .select("status")
    .eq("business_id", businessId)
    .eq("id", periodId)
    .single();
  if (readError) throw readError;

  const from = (period as { status: PeriodStatus }).status;
  const refusal = explainPeriodTransition(from, status);
  if (refusal) throw new Error(refusal);

  const {
    data: { user },
  } = await (await createCoreClient({ schema: "core" })).auth.getUser();

  const { error } = await supabase
    .from("accounting_periods")
    .update({
      status,
      // Who closed the books and when is part of the audit trail, and is cleared again
      // if a locked period is reopened -- a stale closed_at would read as though the
      // period were still closed.
      closed_at: status === "closed" || status === "filed" ? new Date().toISOString() : null,
      closed_by: status === "closed" || status === "filed" ? (user?.id ?? null) : null,
    })
    .eq("business_id", businessId)
    .eq("id", periodId);
  if (error) throw error;
}
